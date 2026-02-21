-- Phase 5: Global Precedent Hive-Mind RAG Storage
-- Required Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Central Hive-Mind Table
CREATE TABLE IF NOT EXISTS public.hive_mind_precedents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creditor_name TEXT NOT NULL,
    statute_category TEXT,           -- e.g., 'FCRA', 'FDCPA'
    dispute_strategy_narrative TEXT NOT NULL,
    successful_outcome_description TEXT,
    strategy_embedding VECTOR(1536), -- text-embedding-3-small
    confidence_weight NUMERIC(3,2) DEFAULT 1.0, -- Boost cases that work repeatedly
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexing for Fast Cosine Similarity Searches
CREATE INDEX IF NOT EXISTS idx_hive_mind_embedding 
ON public.hive_mind_precedents 
USING ivfflat (strategy_embedding vector_cosine_ops)
WITH (lists = 100);

-- RPC Function for Similarity Search directly from PostgREST/Supabase API
CREATE OR REPLACE FUNCTION match_hive_mind_strategies (
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  creditor_name TEXT,
  statute_category TEXT,
  dispute_strategy_narrative TEXT,
  successful_outcome_description TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    hive.id,
    hive.creditor_name,
    hive.statute_category,
    hive.dispute_strategy_narrative,
    hive.successful_outcome_description,
    1 - (hive.strategy_embedding <=> query_embedding) AS similarity
  FROM public.hive_mind_precedents hive
  WHERE 1 - (hive.strategy_embedding <=> query_embedding) > match_threshold
  ORDER BY hive.strategy_embedding <=> query_embedding
  LIMIT match_count;
$$;
