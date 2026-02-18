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

const app = express();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
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

// Error Handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
app.listen(env.PORT, () => {
    console.log(`MerryMac Backend running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
});
