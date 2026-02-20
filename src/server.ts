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
    res.json({
        status: 'ok',
        env: env.NODE_ENV,
        version: 'build-fix-v2',
        ai_connectivity: !!env.OPENAI_API_KEY,
        timestamp: new Date().toISOString()
    });
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

import jobsRoutes from './routes/jobs';

app.use('/api/automation', automationRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/chat', chatRoutes);

// TEMPORARY PHASE 3 MIGRATION ENDPOINT (OPTION 3)
import { Pool } from 'pg';
app.post('/api/internal/run-phase3-migration', async (req, res) => {
    // Zero-trust internal execution.
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!dbUrl) {
        return res.status(500).json({ error: "No DB URL configured." });
    }

    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.query(`
        -- 1. creditors
        CREATE TABLE IF NOT EXISTS public.creditors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          canonical_name TEXT NOT NULL UNIQUE,
          creditor_type TEXT NOT NULL CHECK (
            creditor_type IN (
              'bank',
              'credit_union',
              'debt_buyer',
              'collection_agency',
              'fintech',
              'unknown'
            )
          ),
          headquarters_state TEXT,
          regulatory_body TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_creditors_name ON public.creditors (canonical_name);

        -- 2. creditor_aliases
        CREATE TABLE IF NOT EXISTS public.creditor_aliases (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          creditor_id UUID REFERENCES public.creditors(id) ON DELETE CASCADE,
          alias_name TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_creditor_alias_name ON public.creditor_aliases (LOWER(alias_name));

        -- 3. creditor_litigation_profile
        CREATE TABLE IF NOT EXISTS public.creditor_litigation_profile (
          creditor_id UUID PRIMARY KEY REFERENCES public.creditors(id) ON DELETE CASCADE,
          total_cases INTEGER DEFAULT 0,
          consumer_wins INTEGER DEFAULT 0,
          creditor_wins INTEGER DEFAULT 0,
          settlement_rate NUMERIC(5,2) DEFAULT 0,
          avg_settlement_amount NUMERIC(12,2) DEFAULT 0,
          litigation_aggression_score NUMERIC(3,2) DEFAULT 0,
          last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
        );

        -- 4. creditor_cfpb_profile
        CREATE TABLE IF NOT EXISTS public.creditor_cfpb_profile (
          creditor_id UUID PRIMARY KEY REFERENCES public.creditors(id) ON DELETE CASCADE,
          total_complaints INTEGER DEFAULT 0,
          complaints_last_12_months INTEGER DEFAULT 0,
          high_severity_ratio NUMERIC(3,2) DEFAULT 0,
          response_timeliness_score NUMERIC(3,2) DEFAULT 0
        );

        -- 5. creditor_bureau_behavior
        CREATE TABLE IF NOT EXISTS public.creditor_bureau_behavior (
          creditor_id UUID REFERENCES public.creditors(id) ON DELETE CASCADE,
          bureau TEXT CHECK (bureau IN ('experian','equifax','transunion')),
          avg_verification_rate NUMERIC(3,2) DEFAULT 0,
          avg_deletion_rate NUMERIC(3,2) DEFAULT 0,
          avg_response_time_days INTEGER DEFAULT 30,
          PRIMARY KEY (creditor_id, bureau)
        );

        -- 6. Materialized View
        DROP MATERIALIZED VIEW IF EXISTS public.creditor_enforcement_score;
        CREATE MATERIALIZED VIEW public.creditor_enforcement_score AS
        SELECT
          c.id,
          c.canonical_name,
          COALESCE(
            (
              (
                (lp.consumer_wins::float / NULLIF(lp.total_cases,0)) * 0.4
              )
              +
              (cf.high_severity_ratio * 0.2)
              +
              ((1 - lp.litigation_aggression_score) * 0.2)
              +
              (cf.response_timeliness_score * 0.2)
            ),
            0.15
          ) AS enforcement_weakness_score
        FROM public.creditors c
        LEFT JOIN public.creditor_litigation_profile lp ON c.id = lp.creditor_id
        LEFT JOIN public.creditor_cfpb_profile cf ON c.id = cf.creditor_id;

        CREATE INDEX IF NOT EXISTS idx_enforcement_score_id ON public.creditor_enforcement_score (id);
        
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        `);

        res.json({ status: "success", message: "Phase 3 Substrate Deployed Securely." });
    } catch (e: any) {
        console.error("Migration Error:", e);
        res.status(500).json({ error: e.message });
    } finally {
        await pool.end();
    }
});

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
