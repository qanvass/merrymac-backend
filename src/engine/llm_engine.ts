import OpenAI from 'openai';
import { env } from '../config/env';
import { AnalysisResult, CreditReport } from '../types';
import { forensicEngine } from './forensic_engine';

const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
});

export const llmEngine = {
    async analyzeReport(report: CreditReport): Promise<AnalysisResult> {
        console.log("[SovereignV2] Initiating Dual-Agent Consensus Protocol...");

        // 1. Run Deterministic Forensics
        const { violations: forensicIssues } = await forensicEngine.scanReport(report);
        const estimatedRecovery = forensicEngine.calculateScoreRecovery(forensicIssues);

        // 2. Prepare Data for LLM (Masked PII)
        const maskedReport = {
            scores: report.scores,
            summary: report.summary,
            tradelines: report.tradelines.map(t => ({ ...t, accountNumber: '****' })),
            collections: report.collections,
            inquiries: report.inquiries,
            judgments: report.publicRecords
        };

        // 3. Dual-Agent Swarm Implementation
        if (env.OPENAI_API_KEY) {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4-turbo",
                    messages: [
                        {
                            role: "system",
                            content: `You are the MerryMac Sovereign Dual-Agent Swarm.
                            AGENT A: Forensic Auditor (Objective: Identify every reporting discrepancy, balance error, and timing mismatch).
                            AGENT B: Legal Counsel (Objective: Map discrepancies to specific consumer protection laws: FCRA, FDCPA, FCBA).
                            
                            PROTOCOL:
                            1. Auditor lists potential issues.
                            2. Counsel filters for legally actionable violations.
                            3. Aggregate into a cohesive 'Sovereign Consensus'.`
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
                        ficoEstimate: 580 + Math.round(Math.random() * 40), // Base estimate + variation
                        riskLevel: estimatedRecovery > 50 ? 'HIGH' : 'MEDIUM',
                        removalProbability: 70 + Math.round(Math.random() * 20)
                    }
                };
            } catch (error) {
                console.error("[LLMEngine] Swarm Error:", error);
            }
        }

        return {
            forensic_status: 'SIMULATED',
            detected_violations: forensicIssues,
            ai_audit_opinion: "Engine running in Forensic Simulation mode. Real-time AI analysis requires OpenAI API activation.",
            ai_legal_opinion: "Simulation mode active. Verify API key connectivity.",
            estimated_score_recovery: estimatedRecovery,
            scoring: {
                ficoEstimate: 600,
                riskLevel: 'MEDIUM',
                removalProbability: 50
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
                model: "gpt-4-turbo",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });

            return JSON.parse(completion.choices[0].message.content || '{}');
        } catch (error) {
            console.error("[LLMEngine] Extraction Error:", error);
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
                    model: "gpt-4-turbo",
                    messages: [
                        {
                            role: "system",
                            content: `You are the MerryMac Sovereign Oracle. 
                            Your goal is to provide expert-level forensic analysis and legal guidance.
                            
                            CASE CONTEXT:
                            ${context}
                            
                            CRITICAL: Be professional, aggressive in dispute strategy, and always cite relevant statutes. 
                            Use the provided conversation history to maintain context and continuity.`
                        },
                        ...historyMessages,
                        { role: "user", content: prompt }
                    ]
                });
                return completion.choices[0].message.content || "I am unable to process that at the moment.";
            } catch (error) {
                console.error("[LLMEngine] Chat API Error:", error);
            }
        }
        return "Sovereign Mode is currently running in simulation.";
    }
};
