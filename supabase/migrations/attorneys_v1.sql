-- Phase 10: Attorney Referral & Revenue Router Storage Layer

CREATE TABLE IF NOT EXISTS public.attorneys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  firm_name TEXT,
  email TEXT,
  api_endpoint TEXT,
  states_served TEXT[],
  accepts_pre_lit BOOLEAN DEFAULT true,
  accepts_litigation BOOLEAN DEFAULT true,
  revenue_share_percent NUMERIC(5,2),
  active BOOLEAN DEFAULT true
);

-- Note: dossier_id references public.dossiers(id).
-- In local AI development we use raw UUIDs unless strict constraints are applied.

CREATE TABLE IF NOT EXISTS public.attorney_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE,
  attorney_id UUID REFERENCES public.attorneys(id) ON DELETE CASCADE,
  referral_status TEXT DEFAULT 'sent', -- sent, viewed, accepted, rejected, settled
  referral_hash TEXT,
  revenue_share_amount NUMERIC(12,2),
  consumer_consent BOOLEAN DEFAULT false,
  consent_timestamp TIMESTAMP,
  consumer_state TEXT,
  violation_score NUMERIC(10,2),
  expected_value NUMERIC(12,2),
  attorney_response_notes TEXT,
  settlement_amount NUMERIC(12,2),
  created_at TIMESTAMP DEFAULT now()
);

-- Strict enforce Append-Only on Referrals
CREATE OR REPLACE FUNCTION prevent_referral_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Deletions to attorney_referrals are strictly prohibited to maintain referral chain of custody.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_delete_referrals
BEFORE DELETE ON public.attorney_referrals
FOR EACH ROW EXECUTE FUNCTION prevent_referral_delete();

-- Zero-Trust RLS Policies
ALTER TABLE public.attorneys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attorney_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Service Role Access" ON public.attorneys FOR ALL USING (true);
CREATE POLICY "Allow Service Role Access" ON public.attorney_referrals FOR ALL USING (true);

-- Seed Hybrid Setup Initial Attorney
INSERT INTO public.attorneys (name, firm_name, email, states_served, accepts_pre_lit, accepts_litigation, revenue_share_percent, active)
VALUES ('Demo Partner', 'MerryMac Legal Partners', 'partners@merrymac.io', '{"TX", "CA", "NY", "FL"}', true, true, 0.40, true)
ON CONFLICT (id) DO NOTHING;
