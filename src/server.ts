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

const app = express();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

// Middleware
app.use(helmet());

// PHASE 1: CORS DEADLOCK FIX
// Remove default '*' fallback. Enforce process.env.CORS_ORIGIN.
const allowedOrigins = env.CORS_ORIGIN === '*' ? [] : env.CORS_ORIGIN.split(',');

if (env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    console.warn("⚠️  WARNING: CORS_ORIGIN is not set in production. Clients may be blocked.");
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow mobile apps or curl (no origin) if allowed, otherwise block/check list
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || env.CORS_ORIGIN === '*') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(limiter);
app.use(express.json());
app.use(morgan('dev'));

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV, timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/forensic', forensicRoutes);
app.use('/api/scoring', scoringRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/email', emailRoutes);
// Phase 1: Secure Intake & Phase 8: Data Retrieval
app.use('/api/ingestion', ingestionRoutes);
app.use('/api/reports', reportsRoutes);

// Error Handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// PHASE 3: ENVIRONMENT ENFORCEMENT
if (env.NODE_ENV === 'production') {
    if (!env.OPENAI_API_KEY) {
        throw new Error("❌ CRITICAL: OPENAI_API_KEY is missing in production. Server startup aborted.");
    }
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN === '*') {
        // We allow * for now if explicitly set, but warn. But the prompt says "If CORS_ORIGIN missing... throw"
        if (!env.CORS_ORIGIN) throw new Error("❌ CRITICAL: CORS_ORIGIN is missing in production.");
    }
}

// Start Server
app.listen(env.PORT, () => {
    console.log(`MerryMac Backend running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`CORS Policy: ${env.CORS_ORIGIN}`);
});
