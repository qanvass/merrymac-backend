import OpenAI from 'openai';
import { env } from '../../config/env';
import { supabase } from '../../services/supabase';

const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
});

export interface HiveMindStrategy {
    id?: string;
    creditorName: string;
    statuteCategory: string;
    disputeStrategyNarrative: string;
    successfulOutcomeDescription: string;
    similarity?: number;
}

export const embeddingEngine = {
    /**
     * Converts a text string into a 1536-dimensional float array using OpenAI's embedding model.
     */
    async generateEmbedding(text: string): Promise<number[] | null> {
        if (!env.OPENAI_API_KEY) return null;

        try {
            const response = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: text,
                encoding_format: "float",
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error(`[EmbeddingEngine] Failed to generate vector:`, error);
            return null;
        }
    },

    /**
     * Learns a successful strategy by embedding it and storing it in the Hive Mind.
     * To be called when a user successfully settles or deletes a tradeline.
     */
    async submitSuccessfulStrategy(strategy: HiveMindStrategy): Promise<boolean> {
        if (!supabase) {
            console.warn("[EmbeddingEngine] Supabase not connected. Cannot store strategy locally.");
            return false;
        }

        const narrativeText = `Creditor: ${strategy.creditorName}. Statute: ${strategy.statuteCategory}. Strategy: ${strategy.disputeStrategyNarrative} Outcome: ${strategy.successfulOutcomeDescription}`;
        const vector = await this.generateEmbedding(narrativeText);

        if (!vector) return false;

        const { error } = await supabase.from('hive_mind_precedents').insert({
            creditor_name: strategy.creditorName,
            statute_category: strategy.statuteCategory,
            dispute_strategy_narrative: strategy.disputeStrategyNarrative,
            successful_outcome_description: strategy.successfulOutcomeDescription,
            strategy_embedding: vector,
            confidence_weight: 1.0 // Initial weight
        });

        if (error) {
            console.error(`[EmbeddingEngine] Failed to save to Hive Mind:`, error);
            return false;
        }

        console.log(`[EmbeddingEngine] Hive Mind upgraded. Learned strategy against ${strategy.creditorName}.`);
        return true;
    },

    /**
     * Queries the Hive Mind RAG pipeline for the most similar past strategies.
     */
    async searchHiveMind(queryText: string, matchThreshold = 0.75, matchCount = 3): Promise<HiveMindStrategy[]> {
        if (!supabase || !env.OPENAI_API_KEY) return [];

        const queryEmbedding = await this.generateEmbedding(queryText);
        if (!queryEmbedding) return [];

        const { data, error } = await supabase.rpc('match_hive_mind_strategies', {
            query_embedding: queryEmbedding,
            match_threshold: matchThreshold,
            match_count: matchCount,
        });

        if (error) {
            console.error(`[EmbeddingEngine] RAG Query failed:`, error);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            creditorName: row.creditor_name,
            statuteCategory: row.statute_category,
            disputeStrategyNarrative: row.dispute_strategy_narrative,
            successfulOutcomeDescription: row.successful_outcome_description,
            similarity: row.similarity
        }));
    }
};
