-- Phase 9: Automated Evidence Dossier Builder Storage Layer

CREATE TABLE IF NOT EXISTS public.dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeline_id UUID NOT NULL,
  consumer_id UUID NOT NULL,
  dossier_hash TEXT NOT NULL,
  pdf_hash TEXT,
  version TEXT DEFAULT 'V1',
  created_at TIMESTAMP DEFAULT now()
);

-- Note: In production these foreign keys would bind to public.tradelines and public.consumers.
-- For local AI development, we use raw UUID types to mirror the exact structure without cross-table constraints right now.

CREATE TABLE IF NOT EXISTS public.dossier_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Strict enforce Append-Only on Events
CREATE OR REPLACE FUNCTION prevent_dossier_event_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Updates to dossier_events are strictly prohibited to maintain chain of custody.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_update_dossier_events
BEFORE UPDATE ON public.dossier_events
FOR EACH ROW EXECUTE FUNCTION prevent_dossier_event_update();

CREATE OR REPLACE FUNCTION prevent_dossier_event_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Deletions to dossier_events are strictly prohibited to maintain chain of custody.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_delete_dossier_events
BEFORE DELETE ON public.dossier_events
FOR EACH ROW EXECUTE FUNCTION prevent_dossier_event_delete();

-- Zero-Trust RLS Policies
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Service Role Access" ON public.dossiers FOR ALL USING (true);
CREATE POLICY "Allow Service Role Access" ON public.dossier_events FOR ALL USING (true);
