import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
        auth: { autoRefreshToken: false, persistSession: false }
    }
);

async function runMigration() {
    console.log("Starting Sovereign V14 Schema Migration...");

    // Using raw SQL for the extension since Supabase RPC might be limited on auth
    // Note: To run raw SQL like this safely, we actually need to use the `supabase.rpc` 
    // to call a predefined function or execute individual queries if the API allows.
    // However, Supabase REST API doesn't directly support raw SQL exec unless a function
    // is created. 

    // For this migration, we will create the tables via the REST API if possible, 
    // or log instructions if we need to run it in the Supabase Dashboard.

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
        CREATE MATERIALIZED VIEW IF NOT EXISTS public.creditor_enforcement_score AS
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

    console.log("To execute this schema successfully, please run the following SQL directly in your Supabase SQL Editor:");
    console.log("--------------------------------------------------");
    console.log(sqlScript);
    console.log("--------------------------------------------------");

    console.log("Attempting to insert Seed Data via REST...");

    // Insert Creditors
    const { data: creditors, error: cErr } = await supabaseAdmin.from('creditors').upsert([
        { canonical_name: 'Navy Federal Credit Union', creditor_type: 'credit_union', headquarters_state: 'VA', regulatory_body: 'NCUA' },
        { canonical_name: 'Capital One', creditor_type: 'bank', headquarters_state: 'VA', regulatory_body: 'OCC' },
        { canonical_name: 'Portfolio Recovery Associates', creditor_type: 'debt_buyer', headquarters_state: 'VA', regulatory_body: 'CFPB' },
        { canonical_name: 'Midland Credit Management', creditor_type: 'debt_buyer', headquarters_state: 'CA', regulatory_body: 'CFPB' }
    ], { onConflict: 'canonical_name' }).select();

    if (cErr) {
        console.error("Failed to seed creditors (Tables might not exist yet):", cErr.message);
        return;
    }

    console.log("Seeded basic creditors:", creditors?.length);

    // Seed Aliases
    if (creditors) {
        const navyFed = creditors.find(c => c.canonical_name === 'Navy Federal Credit Union');
        if (navyFed) {
            await supabaseAdmin.from('creditor_aliases').upsert([
                { creditor_id: navyFed.id, alias_name: 'navy federal' },
                { creditor_id: navyFed.id, alias_name: 'navy federal credit union' }
            ], { onConflict: 'id' }); // Assuming we don't have a unique constraint on alias for upsert easily, just standard insert is safer if empty
        }

        const portfolio = creditors.find(c => c.canonical_name === 'Portfolio Recovery Associates');
        if (portfolio) {
            await supabaseAdmin.from('creditor_litigation_profile').upsert([
                { creditor_id: portfolio.id, total_cases: 500, consumer_wins: 220, creditor_wins: 280, litigation_aggression_score: 0.6 }
            ], { onConflict: 'creditor_id' });
        }
    }

    console.log("Seed data applied (or attempted).");
}

runMigration().catch(console.error);
