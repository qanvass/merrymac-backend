import express from 'express';
import { llmEngine } from '../engine/llm_engine';
import { CaseMemory } from '../engine/sovereign_engine';
import { chatMemory } from '../services/chat_memory';
import { sovereignEmitter } from '../events/sovereign_events';

const router = express.Router();

router.post('/query', async (req, res) => {
    try {
        const { prompt, caseId } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required." });
        }

        let context = "No active credit case found.";
        let caseData: any = null;

        // 1. Fetch Case Context from Supabase
        if (caseId) {
            try {
                // Try legacy CanonicalCase first (cases table)
                caseData = await CaseMemory.load(caseId);
                if (caseData) {
                    const findingsText = caseData.findings?.map((f: any) => `- [${f.rule_id}] ${f.description} (Statute: ${f.statute})`).join('\n') || 'None';
                    context = `
                    ACTIVE CASE: ${caseData.case_id}
                    SUBJECT: ${caseData.consumer_identity?.name || 'Unknown'}
                    TRADELINES: ${caseData.tradelines?.length || 0} accounts identified.
                    VIOLATIONS: ${caseData.findings?.length || 0} actionable violations found.

                    FINDINGS SUMMARY:
                    ${findingsText}

                    AI AUDIT OPINION: ${caseData.metadata?.ai_audit_opinion || 'Pending'}
                    AI LEGAL OPINION: ${caseData.metadata?.ai_legal_opinion || 'Pending'}
                    `;
                } else {
                    // Fall back to UserCreditProfile (profiles table — written by sovereign engine v2)
                    const profile = await CaseMemory.loadProfile(caseId);
                    if (profile) {
                        const violationsText = profile.activeViolations?.map((v: any) =>
                            `- [${v.rule_id}] ${v.description} (Statute: ${v.statute})`
                        ).join('\n') || 'None';
                        context = `
                        ACTIVE CASE: ${caseId}
                        SUBJECT: ${profile.identity?.name || 'Unknown Consumer'}
                        TRADELINES: ${profile.tradelines?.length || 0} accounts identified.
                        VIOLATIONS: ${profile.activeViolations?.length || 0} actionable violations found.
                        TOTAL DEBT: $${profile.metrics?.totalDebt?.toLocaleString() || 0}
                        UTILIZATION: ${profile.metrics?.utilization || 0}%

                        VIOLATION SUMMARY:
                        ${violationsText}
                        `;
                    }
                }
            } catch (err) {
                console.error(`[Chat] Failed to load case ${caseId}:`, err);
            }
        }

        // 2. Fetch Conversation History
        const history = caseId ? await chatMemory.getHistory(caseId) : [];

        // 3. Save User Message
        if (caseId) {
            await chatMemory.saveMessage({ case_id: caseId, role: 'user', content: prompt });
        }

        // 4. Execute LLM Query with Context & History
        const response = await llmEngine.chat(prompt, context, history);

        // 5. Save Assistant Response
        if (caseId) {
            await chatMemory.saveMessage({ case_id: caseId, role: 'assistant', content: response });
        }

        res.json({
            text: response,
            case_id: caseId
        });

    } catch (error: any) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
