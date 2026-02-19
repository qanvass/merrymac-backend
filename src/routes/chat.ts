import express from 'express';
import { llmEngine } from '../engines/llm_engine';
import { CaseMemory } from '../engines/sovereign_engine';
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
                }
            } catch (err) {
                console.error(`[Chat] Failed to load case ${caseId}:`, err);
            }
        }

        // 2. Execute LLM Query with Context
        // We use a simplified version of analyzeReport logic or a dedicated chat prompt
        const response = await llmEngine.chat(prompt, context);

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
