CREATE TABLE IF NOT EXISTS public.bureau_verification_patterns (
  bureau TEXT PRIMARY KEY CHECK (bureau IN ('experian','equifax','transunion')),
  avg_auto_verification_rate NUMERIC(3,2) DEFAULT 0.6,
  avg_deletion_rate NUMERIC(3,2) DEFAULT 0.2,
  avg_response_days INTEGER DEFAULT 30,
  mov_success_rate NUMERIC(3,2) DEFAULT 0.3,
  cfpb_escalation_success_rate NUMERIC(3,2) DEFAULT 0.4
);

INSERT INTO public.bureau_verification_patterns (bureau, avg_auto_verification_rate, avg_deletion_rate, avg_response_days, mov_success_rate, cfpb_escalation_success_rate) VALUES
('experian', 0.75, 0.18, 25, 0.28, 0.38),
('equifax', 0.60, 0.25, 30, 0.35, 0.45),
('transunion', 0.55, 0.32, 32, 0.40, 0.50)
ON CONFLICT (bureau) DO NOTHING;
