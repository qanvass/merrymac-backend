CREATE TABLE IF NOT EXISTS public.dispute_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeline_id UUID,
  bureau TEXT CHECK (bureau IN ('experian','equifax','transunion')),
  round_number INTEGER,
  action_taken TEXT,
  bureau_response TEXT,
  creditor_response TEXT,
  result TEXT, -- verified, deleted, no_response, partial_update
  response_days INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_tradeline ON public.dispute_rounds (tradeline_id);
