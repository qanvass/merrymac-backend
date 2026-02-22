import OpenAI from 'openai';
import { env } from '../config/env';
import { AnalysisResult, CreditReport } from '../types';
import { forensicEngine } from './forensic_engine';
import { precedentEngine, PrecedentSnippet } from './precedent/precedent_engine';
import { embeddingEngine, HiveMindStrategy } from './precedent/embedding_engine';

const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY || 'dummy_key',
});

export const llmEngine = {
    async analyzeReport(report: CreditReport): Promise<AnalysisResult> {
        console.log("[SovereignV2] Initiating Dual-Agent Consensus Protocol...");

        // 1. Run Deterministic Forensics
        const { violations: forensicIssues, scoring: forensicScoring, dualLLM: forensicOpinion } = await forensicEngine.scanReport(report);
        const estimatedRecovery = forensicEngine.calculateScoreRecovery(forensicIssues);

        const baseScore = report.scores?.equifax || report.scores?.transunion || report.scores?.experian || 0;

        // 2. Prepare Data for LLM (Masked PII)
        const maskedReport = {
            scores: report.scores,
            summary: report.summary,
            tradelines: report.tradelines.map(t => ({ ...t, accountNumber: '****' })),
            collections: report.collections,
            inquiries: report.inquiries,
            judgments: report.publicRecords
        };

        // 2b. Extract Unique Creditors for RAG context
        const uniqueCreditors = Array.from(new Set(report.tradelines.map(t => t.creditor)));
        const allPrecedents: PrecedentSnippet[] = [];
        const hiveMindStrategies: HiveMindStrategy[] = [];

        // Ensure we don't bombard the API and hit rate limits if there are many creditors
        for (const creditor of uniqueCreditors.slice(0, 3)) {
            // 1. Fetch External Case Law
            const cases = await precedentEngine.searchRelevantCaseLaw(creditor, ["FCRA", "FDCPA"]);
            allPrecedents.push(...cases);

            // 2. Fetch Internal Hive-Mind Successful Strategies (pgvector RAG)
            const internalStrats = await embeddingEngine.searchHiveMind(creditor, 0.70, 2);
            hiveMindStrategies.push(...internalStrats);
        }

        const caseLawContext = allPrecedents.length > 0
            ? `\nRELEVANT PUBLIC PRECEDENTS TO CITE:\n${allPrecedents.map((p, i) => `[${i + 1}] ${p.caseName} (${p.dateFiled}): ${p.snippet}\nURL: ${p.url}`).join('\n\n')}`
            : `\nRELEVANT PUBLIC PRECEDENTS TO CITE:\nNo specific cases found via public RAG for these creditors. Rely on general statutory limits.`;

        const hiveMindContext = hiveMindStrategies.length > 0
            ? `\nPROPRIETARY HIVE-MIND SUCCESSFUL STRATEGIES AGAINST THESE CREDITORS:\n${hiveMindStrategies.map((s, i) => `[Strategy ${i + 1}] Against ${s.creditorName} (${s.statuteCategory}):\nAction: ${s.disputeStrategyNarrative}\nOutcome: ${s.successfulOutcomeDescription}`).join('\n\n')}`
            : `\nPROPRIETARY HIVE-MIND SUCCESSFUL STRATEGIES:\nNo internal precedents found yet. You must establish the winning strategy.`;

        // 3. Dual-Agent Swarm Implementation
        let apiCallFailed = false;
        if (env.OPENAI_API_KEY) {
            try {
                const completion = await openai.chat.completions.create({
                    model: env.OPENAI_MODEL,
                    messages: [
                        {
                            role: "system",
                            content: `You are the MerryMac Sovereign Dual-Agent Swarm.
                            AGENT A: Forensic Auditor (Objective: Identify every reporting discrepancy, balance error, and timing mismatch).
                            AGENT B: Legal Counsel (Objective: Map discrepancies to specific consumer protection laws: FCRA, FDCPA, FCBA).
                            
                            PROTOCOL:
                            1. Auditor lists potential issues.
                            2. Counsel filters for legally actionable violations and aggressively CITES the provided Relevant Precedents.
                            3. Aggregate into a cohesive 'Sovereign Consensus'.
                            
                            ${caseLawContext}

                            ${hiveMindContext}`
                        },
                        {
                            role: "user",
                            content: `AUDIT TARGET: ${JSON.stringify(maskedReport, null, 2)}`
                        }
                    ],
                    response_format: { type: "text" }
                });

                const aiOpinion = completion.choices[0].message.content || "";

                return {
                    forensic_status: 'COMPLETE',
                    detected_violations: forensicIssues,
                    ai_audit_opinion: aiOpinion,
                    ai_legal_opinion: "Sovereign Consensus reached. Actionable statutes identified.",
                    estimated_score_recovery: estimatedRecovery,
                    scoring: {
                        ficoEstimate: baseScore,
                        riskLevel: forensicScoring.riskLevel,
                        removalProbability: forensicScoring.removalProbability
                    }
                };
            } catch (error: any) {
                const detail = error?.response?.data || error?.message || error;
                console.error("[LLMEngine] Swarm Error:", detail);
                apiCallFailed = true;
            }
        }

        return {
            forensic_status: 'SIMULATED',
            simulation_reason: apiCallFailed ? 'API_ERROR' : 'KEY_MISSING',
            detected_violations: forensicIssues,
            ai_audit_opinion: forensicOpinion.forensicOpinion,
            ai_legal_opinion: forensicOpinion.legalOpinion,
            estimated_score_recovery: estimatedRecovery,
            scoring: {
                ficoEstimate: baseScore,
                riskLevel: forensicScoring.riskLevel,
                removalProbability: forensicScoring.removalProbability
            }
        };
    },

    async extractStructuredData(prompt: string): Promise<any> {
        if (!env.OPENAI_API_KEY) {
            console.warn("[LLMEngine] API Key missing for extraction. Returning null.");
            return null;
        }

        try {
            const completion = await openai.chat.completions.create({
                model: env.OPENAI_MODEL,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });

            return JSON.parse(completion.choices[0].message.content || '{}');
        } catch (error: any) {
            const detail = error?.response?.data || error?.message || error;
            console.error("[LLMEngine] Extraction Error:", detail);
            return null;
        }
    },

    async chat(prompt: string, context: string, history: any[] = []): Promise<string> {
        console.log("[LLMEngine] Processing chat query with history context...");

        if (env.OPENAI_API_KEY) {
            try {
                // Map history to OpenAI format
                const historyMessages = history.map(h => ({
                    role: h.role,
                    content: h.content
                }));

                const completion = await openai.chat.completions.create({
                    model: env.OPENAI_MODEL,
                    messages: [
                        {
                            role: "system",
                            content: `You are the MerryMac Sovereign Oracle.
                            Your goal is to provide expert-level forensic analysis and legal guidance.
                            
                            CASE CONTEXT:
                            ${context}
                            
                            CRITICAL: Be professional, aggressive in dispute strategy, and always cite relevant statutes. 
                            Use the provided conversation history to maintain context and continuity.
                            NOTE: If the user asks about case law, you MUST use RAG-retrieved precedents if they were placed into context, or fallback to your internal training data otherwise.`
                        },
                        ...historyMessages,
                        { role: "user", content: prompt }
                    ]
                });
                return completion.choices[0].message.content || "I am unable to process that at the moment.";
            } catch (error: any) {
                const detail = error?.response?.data || error?.message || error;
                console.error("[LLMEngine] Chat API Error:", detail);
                throw new Error(`LLM_API_FAILURE: ${detail}`);
            }
        }
        return "Sovereign Mode is currently running in simulation. Set OPENAI_API_KEY to enable.";
    }
};
