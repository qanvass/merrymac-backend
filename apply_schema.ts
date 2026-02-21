import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { execSync } from 'child_process';

let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.log("DATABASE_URL not found in env. Attempting to fetch from Railway CLI...");
  try {
    const out = execSync('railway variables', { encoding: 'utf-8' });
    const match = out.match(/SUPABASE_DB_URL\s+(.+)/);
    if (match && match[1]) {
      dbUrl = match[1].trim();
    }
  } catch (e) {
    console.error("Failed to fetch from Railway CLI:", e);
  }
}

if (!dbUrl) {
  console.error("No DATABASE_URL found. Please ensure the Postgres connection URL is available in the environment.");
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
});

async function runPgMigration() {
  console.log("Connecting to PostgreSQL...");
  await client.connect();

  const sqlScript = `
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
        -- First drop it if we are recreating to avoid errors if logic changed
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
    `;

  try {
    console.log("Executing strict V14 SQL Schema via pg client...");
    await client.query(sqlScript);
    console.log("Schema applied successfully.");
  } catch (e) {
    console.error("Schema execution failed:", e);
  } finally {
    await client.end();
  }
}

runPgMigration().catch(console.error);
