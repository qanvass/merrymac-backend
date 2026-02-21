-- Phase 10: Supabase Persistence & Vault Wiring
-- Relational schemas for User Profiles, Reports, and Evidence

-- 1. User Profiles (Extends Supabase Auth Auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    subscription_status TEXT DEFAULT 'ACTIVE',
    subscription_tier TEXT DEFAULT 'SOVEREIGN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS Policies for user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" 
ON public.user_profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.user_profiles FOR UPDATE 
USING (auth.uid() = id);

-- 2. Credit Reports (Raw Ingestions)
CREATE TABLE IF NOT EXISTS public.credit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    source TEXT NOT NULL, -- 'Credit Karma', 'IdentityIQ', 'Manual PDF'
    raw_text_payload TEXT NOT NULL, -- The extracted text sent to the LLM
    storage_path TEXT, -- Optional pointer to Supabase Storage bucket for the original PDF
    scores JSONB, -- { "experian": 720, "transunion": 710, "equifax": 715 }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.credit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports" 
ON public.credit_reports FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reports" 
ON public.credit_reports FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 3. Trade Lines & Intelligence (Derived Data)
CREATE TABLE IF NOT EXISTS public.intelligence_tradelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.credit_reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    creditor_name TEXT NOT NULL,
    bureau TEXT NOT NULL, -- 'EXPERIAN', 'TRANSUNION', 'EQUIFAX'
    account_number TEXT,
    balance NUMERIC,
    is_disputed BOOLEAN DEFAULT false,
    violations JSONB DEFAULT '[]'::jsonb, -- Array of identified FCRA/FDCPA violations
    enforcement_roi JSONB, -- Expected Recovery calculation obj
    settlement_target JSONB, -- Maximum limit calculation obj
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.intelligence_tradelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tradelines" 
ON public.intelligence_tradelines FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can modify their own tradelines" 
ON public.intelligence_tradelines FOR ALL 
USING (auth.uid() = user_id);

-- 4. Evidence Vault (Generated Documents)
CREATE TABLE IF NOT EXISTS public.evidence_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tradeline_id UUID REFERENCES public.intelligence_tradelines(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, -- '605B_BLOCK', 'CFPB_COMPLAINT', 'METRO2_DISPUTE'
    status TEXT DEFAULT 'DRAFT', -- 'DRAFT', 'GENERATED', 'MAILED'
    storage_path TEXT NOT NULL, -- Pointer to secure PDF in Supabase Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.evidence_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own evidence" 
ON public.evidence_documents FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own evidence" 
ON public.evidence_documents FOR ALL 
USING (auth.uid() = user_id);

-- Setup Storage Bucket for Vault files if it doesn't exist
-- Note: Requires Supabase Storage API or manual creation in dashboard
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user_vaults', 'user_vaults', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Security Policies to guarantee users can only see their own files
CREATE POLICY "Vault items are restricted to owner"
ON storage.objects FOR SELECT
USING ( bucket_id = 'user_vaults' AND auth.uid()::text = (storage.foldername(name))[1] );

CREATE POLICY "Users can upload to their own vault folder"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'user_vaults' AND auth.uid()::text = (storage.foldername(name))[1] );
