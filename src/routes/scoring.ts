import express from 'express';
import { scoringEngine } from '../engine/scoring_engine';
import { supabase } from '../services/supabase';

const router = express.Router();

// Phase 12: In-Memory TTL Caching Layer (5 Minutes)
const cache = new Map<string, { data: any, expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string) {
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.data;
    return null;
}

function setCache(key: string, data: any) {
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

router.post('/simulate', (req, res) => {
    try {
        const { report } = req.body;
        if (!report) return res.status(400).json({ error: "Missing report data" });

        const result = scoringEngine.simulate(report);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/creditor-profile', async (req, res) => {
    try {
        const { creditorName } = req.body;
        if (!creditorName || !supabase) {
            return res.json({ enforcement_weakness_score: 0.15 });
        }

        const normalizeCreditorName = (input: string) => input
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\b(inc|llc|corp|corporation|co|company|na|n.a)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const normalized = normalizeCreditorName(creditorName);
        const cacheKey = `creditor_${normalized}`;
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const { data: aliasData, error: aliasErr } = await supabase
            .from("creditor_aliases")
            .select("creditor_id")
            .ilike("alias_name", normalized);

        if (aliasErr || !aliasData || aliasData.length === 0) {
            const fallback = { enforcement_weakness_score: 0.15 };
            setCache(cacheKey, fallback);
            return res.json(fallback);
        }

        const creditorId = aliasData[0].creditor_id;

        const { data: scoreData, error: scoreErr } = await supabase
            .from("creditor_enforcement_score")
            .select("enforcement_weakness_score")
            .eq("id", creditorId)
            .single();

        if (scoreErr || !scoreData) {
            const fallback = { enforcement_weakness_score: 0.15 };
            setCache(cacheKey, fallback);
            return res.json(fallback);
        }

        const result = { enforcement_weakness_score: scoreData.enforcement_weakness_score };
        setCache(cacheKey, result);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ enforcement_weakness_score: 0.15 });
    }
});

router.post('/sol-profile', async (req, res) => {
    try {
        const { state, debtType = 'written_contract' } = req.body;
        if (!state || !supabase) {
            return res.json({ years: 6 });
        }

        const cacheKey = `sol_${state.toUpperCase()}_${debtType}`;
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const { data, error } = await supabase
            .from("state_statute_of_limitations")
            .select("years")
            .eq("state", state.toUpperCase())
            .eq("debt_type", debtType)
            .single();

        if (error || !data) {
            const fallback = { years: 6 };
            setCache(cacheKey, fallback);
            return res.json(fallback); // Conservative fallback
        }

        const result = { years: data.years };
        setCache(cacheKey, result);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ years: 6 });
    }
});

router.post('/bureau-profile', async (req, res) => {
    try {
        const { bureau } = req.body;
        if (!bureau || !supabase) {
            return res.json({
                bureau: bureau || 'unknown',
                autoVerificationRate: 0.60,
                deletionRate: 0.20,
                movSuccessRate: 0.30,
                cfpbEscalationSuccessRate: 0.40
            });
        }

        const normalizedBureau = bureau.toLowerCase();
        const cacheKey = `bureau_${normalizedBureau}`;
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const { data, error } = await supabase
            .from("bureau_verification_patterns")
            .select("*")
            .eq("bureau", normalizedBureau)
            .single();

        if (error || !data) {
            const fallback = {
                bureau: normalizedBureau,
                autoVerificationRate: 0.60,
                deletionRate: 0.20,
                movSuccessRate: 0.30,
                cfpbEscalationSuccessRate: 0.40
            };
            setCache(cacheKey, fallback);
            return res.json(fallback);
        }

        const result = {
            bureau: data.bureau,
            autoVerificationRate: data.avg_auto_verification_rate,
            deletionRate: data.avg_deletion_rate,
            movSuccessRate: data.mov_success_rate,
            cfpbEscalationSuccessRate: data.cfpb_escalation_success_rate
        };
        setCache(cacheKey, result);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({
            bureau: 'unknown',
            autoVerificationRate: 0.60,
            deletionRate: 0.20,
            movSuccessRate: 0.30,
            cfpbEscalationSuccessRate: 0.40
        });
    }
});

router.post('/round-history', async (req, res) => {
    try {
        const { tradelineId, bureau } = req.body;
        if (!tradelineId || !supabase) {
            return res.json({ rounds: [], latestRound: 0, lastResponse: null });
        }

        let query = supabase
            .from("dispute_rounds")
            .select("*")
            .eq("tradeline_id", tradelineId)
            .order("round_number", { ascending: false });

        if (bureau) {
            query = query.eq("bureau", bureau.toLowerCase());
        }

        const { data, error } = await query;

        if (error || !data || data.length === 0) {
            return res.json({ rounds: [], latestRound: 0, lastResponse: null });
        }

        const latestRound = data[0].round_number;
        const lastResponse = data[0].bureau_response || data[0].result || null;

        res.json({
            rounds: data,
            latestRound,
            lastResponse
        });

    } catch (e: any) {
        res.status(500).json({ rounds: [], latestRound: 0, lastResponse: null });
    }
});

router.post('/settlement-profile', async (req, res) => {
    try {
        const { creditorName } = req.body;
        if (!creditorName) {
            return res.json({ avg_pre_lit_settlement_ratio: 0.40, avg_post_lit_settlement_ratio: 0.65, prefers_lump_sum: true, average_settlement_time_days: 45 });
        }

        if (!supabase) {
            return res.json({ avg_pre_lit_settlement_ratio: 0.40, avg_post_lit_settlement_ratio: 0.65, prefers_lump_sum: true, average_settlement_time_days: 45 });
        }

        const cacheKey = `settlement_${creditorName.toLowerCase()}`;
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const { data, error } = await supabase
            .from("creditors")
            .select(`
                id,
                name,
                creditor_settlement_behavior (
                    avg_pre_lit_settlement_ratio,
                    avg_post_lit_settlement_ratio,
                    prefers_lump_sum,
                    average_settlement_time_days
                )
            `)
            .ilike('name', `%${creditorName}%`)
            .limit(1)
            .single();

        if (error || !data || !data.creditor_settlement_behavior) {
            // Intelligent heuristic fallbacks for Option C (Hybrid Model Simulation)
            const lowerName = creditorName.toLowerCase();
            let preLit = 0.40;
            let postLit = 0.65;

            // Debt Buyers typical extraction minimums
            if (lowerName.includes('portfolio') || lowerName.includes('midland') || lowerName.includes('cavalry')) {
                preLit = 0.25;
                postLit = 0.45;
            }
            // Original Creditors hold firmer
            else if (lowerName.includes('chase') || lowerName.includes('discover') || lowerName.includes('capital')) {
                preLit = 0.55;
                postLit = 0.75;
            }

            const fallback = {
                avg_pre_lit_settlement_ratio: preLit,
                avg_post_lit_settlement_ratio: postLit,
                prefers_lump_sum: true,
                average_settlement_time_days: 45
            };
            setCache(cacheKey, fallback);
            return res.json(fallback);
        }

        const b = data.creditor_settlement_behavior;
        const profile = Array.isArray(b) ? b[0] : b;

        const result = {
            avg_pre_lit_settlement_ratio: profile.avg_pre_lit_settlement_ratio || 0.40,
            avg_post_lit_settlement_ratio: profile.avg_post_lit_settlement_ratio || 0.65,
            prefers_lump_sum: profile.prefers_lump_sum ?? true,
            average_settlement_time_days: profile.average_settlement_time_days || 45
        };
        setCache(cacheKey, result);
        res.json(result);

    } catch (e: any) {
        res.status(500).json({
            avg_pre_lit_settlement_ratio: 0.40,
            avg_post_lit_settlement_ratio: 0.65,
            prefers_lump_sum: true,
            average_settlement_time_days: 45
        });
    }
});

export default router;
