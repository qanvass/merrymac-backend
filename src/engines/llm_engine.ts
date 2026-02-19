import OpenAI from 'openai';
import { env } from '../config/env';
import { AnalysisResult, CreditReport } from '../types';
import { forensicEngine } from './forensic_engine';

const SERVICE_ACCOUNT_KEY = "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";

const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY || SERVICE_ACCOUNT_KEY,
});

export const llmEngine = {
    async analyzeReport(report: CreditReport): Promise<AnalysisResult> {
        console.log("[LLMEngine] Starting analysis...");

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

        // 3. Dual-Swarm Simulation (If API Key Present)
        if (env.OPENAI_API_KEY || SERVICE_ACCOUNT_KEY) {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4-turbo",
                    messages: [
                        {
                            role: "system",
                            content: `You are the MerryMac Dual-Core Consensus Engine.
                            Role 1: Forensic Auditor (Aggressive, detailed, tech-focused).
                            Role 2: Legal Counsel (Prudent, citadel-focused, citation-heavy).
                            
                            Your goal is to find actionable violations of FCRA, FDCPA, and state consumer laws.
                            The Forensic Auditor finds the discrepancy. The Legal Counsel provides the statute.
                            
                            CRITICAL: Return a high-impact summary of violations.`
                        },
                        {
                            role: "user",
                            content: `JSON DATA: ${JSON.stringify(maskedReport, null, 2)}`
                        }
                    ],
                    response_format: { type: "text" }
                });

                const aiSummary = completion.choices[0].message.content || "Manual review recommended.";

                return {
                    forensic_status: 'COMPLETE',
                    detected_violations: forensicIssues,
                    ai_audit_opinion: aiSummary,
                    ai_legal_opinion: "See forensic summary for specific statute citations.",
                    estimated_score_recovery: estimatedRecovery
                };
            } catch (error) {
                console.error("[LLMEngine] OpenAI Error:", error);
            }
        }

        // Fallback or Simulation Mode
        return {
            forensic_status: 'SIMULATED',
            detected_violations: forensicIssues,
            ai_audit_opinion: "Engine running in Forensic Simulation mode. Real-time AI analysis requires OpenAI API activation.",
            ai_legal_opinion: "Simulation mode active. Verify API key connectivity.",
            estimated_score_recovery: estimatedRecovery
        };
    },

    async chat(prompt: string, context: string): Promise<string> {
        console.log("[LLMEngine] Processing chat query...");

        if (env.OPENAI_API_KEY || SERVICE_ACCOUNT_KEY) {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4-turbo",
                    messages: [
                        {
                            role: "system",
                            content: `You are the MerryMac Sovereign Oracle. 
                            Your goal is to provide expert-level forensic analysis and legal guidance on credit reports.
                            Use the following context to answer the user's question precisely.
                            
                            CONTEXT:
                            ${context}
                            
                            CRITICAL: Be professional, aggressive in dispute strategy, and always cite relevant statutes (FCRA/FDCPA) where applicable.`
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                });

                return completion.choices[0].message.content || "I am unable to process that at the moment.";
            } catch (error) {
                console.error("[LLMEngine] Chat API Error:", error);
            }
        }

        return "Sovereign Mode is currently running in simulation. Please verify API connectivity for real-time intelligence.";
    }
};
