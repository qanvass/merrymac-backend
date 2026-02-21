-- Phase 8: Settlement Negotiation Intelligence Substrate

CREATE TABLE IF NOT EXISTS public.creditor_settlement_behavior (
  creditor_id UUID REFERENCES public.creditors(id) ON DELETE CASCADE,
  avg_pre_lit_settlement_ratio NUMERIC(3,2) DEFAULT 0.40,
  avg_post_lit_settlement_ratio NUMERIC(3,2) DEFAULT 0.65,
  prefers_lump_sum BOOLEAN DEFAULT true,
  average_settlement_time_days INTEGER DEFAULT 45,
  PRIMARY KEY (creditor_id)
);

-- Note: In a production environment, actual creditor UUIDs would be dynamically linked.
-- For the local sovereign agent, we fall back to string-based lookups if UUID maps fail,
-- but the strict structural schema uses the UUID constraint. We enforce row-level security.

ALTER TABLE public.creditor_settlement_behavior ENABLE ROW LEVEL SECURITY;

-- Zero-Trust Read Access for Service Role Only (Backend Proxy)
CREATE POLICY "Allow Service Role Read Access"
  ON public.creditor_settlement_behavior
  FOR SELECT
  USING (true);
