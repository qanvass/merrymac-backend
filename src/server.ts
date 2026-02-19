import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import rateLimit from 'express-rate-limit';

// Route Imports
import forensicRoutes from './routes/forensic';
import scoringRoutes from './routes/scoring';
import llmRoutes from './routes/llm';
import vaultRoutes from './routes/vault';
import emailRoutes from './routes/email';
import ingestionRoutes from './routes/ingestion';
import reportsRoutes from './routes/reports';
import automationRoutes from './routes/automation';
import chatRoutes from './routes/chat';

const app = express();

// Trust Proxy for Railway/Vercel Load Balancers
app.set('trust proxy', 2);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: {
        xForwardedForHeader: false // Prevent Railway proxy crash
    }
});

// Middleware
app.use(helmet());
app.use(express.json({ limit: '50mb' })); // Phase 3: JSON Enforcement BEFORE routes
app.use(morgan('dev'));

// Phase 5: CORS Validation
const allowedOrigins = [
    'https://merrymac.io',
    'https://merrymac-ui.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow mobile apps or curl (no origin)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`Blocked CORS origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(limiter);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV, version: 'build-fix-v1', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/forensic', forensicRoutes);
app.use('/api/scoring', scoringRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/email', emailRoutes);
// Phase 1: Secure Intake & Phase 8: Data Retrieval
app.use('/api/ingestion', (req, res, next) => {
    console.log(`[Ingestion Route Hit] ${req.method} ${req.url}`);
    next();
}, ingestionRoutes);

// DEBUG DIRECT ROUTE
app.get('/api/ingestion-direct', (req, res) => {
    res.json({ status: 'direct_route_active' });
});

app.get('/debug-routes', (req, res) => {
    const routes: any[] = [];
    app._router.stack.forEach((middleware: any) => {
        if (middleware.route) { // routes registered directly on the app
            routes.push({
                path: middleware.route.path,
                methods: middleware.route.methods
            });
        } else if (middleware.name === 'router') { // router middleware
            // This is trickier to get path for, but usually regex
            routes.push({
                name: 'router',
                regexp: middleware.regexp.toString()
            });
        }
    });
    res.json({ routes });
});

app.use('/api/reports', reportsRoutes);
app.use('/api/chat', chatRoutes);

// Error Handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// PHASE 3: ENVIRONMENT ENFORCEMENT
if (env.NODE_ENV === 'production') {
    if (!env.OPENAI_API_KEY) {
        console.warn("⚠️  WARNING: OPENAI_API_KEY is missing in production. AI features will be disabled.");
    }
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN === '*') {
        // We allow * for now if explicitly set, but warn. But the prompt says "If CORS_ORIGIN missing... throw"
        if (!env.CORS_ORIGIN) throw new Error("❌ CRITICAL: CORS_ORIGIN is missing in production.");
    }
}

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`MerryMac Backend running on port ${PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`CORS Policy: ${env.CORS_ORIGIN || 'All (Default)'}`);
});
