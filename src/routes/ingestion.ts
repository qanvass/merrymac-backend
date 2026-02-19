import express from 'express';
import { ingestionEngine } from '../engines/ingestion_engine';
import { sovereignEngine } from '../engines/sovereign_engine';
import { sovereignEmitter } from '../events/sovereign_events';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();


router.get('/health', (req, res) => {
    res.json({ status: 'ingestion_active', time: new Date().toISOString() });
});

router.post('/upload', async (req, res) => {
    try {
        const { reportText, pageCount, fileMetadata } = req.body;

        if (!reportText || !pageCount || !fileMetadata) {
            return res.status(400).json({ error: "Invalid payload. Missing reportText, pageCount, or fileMetadata." });
        }

        const caseId = uuidv4();

        // Phase 1: Sovereign Parse (Background)
        // We do NOT await this. We let it run in the background.
        // The client will connect via SSE to follow progress.
        sovereignEngine.parse(reportText, fileMetadata.name, caseId).catch(err => {
            console.error(`[Sovereign] Background processing failed for ${caseId}:`, err);
        });

        res.json({ reportId: caseId });

    } catch (error: any) {
        console.error("Ingestion Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Phase 4: SSE Stream Endpoint
router.get('/stream/:caseId', (req, res) => {
    const { caseId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log(`[SSE] Client connected for case ${caseId}`);

    // HYDRATION LOGIC: Check if case already exists in memory/Supabase
    // If it does, send the current state immediately.
    // This handles page reloads or reconnects.
    import('../engines/sovereign_engine').then(async ({ CaseMemory }) => {
        try {
            const existingCase = await CaseMemory.load(caseId);
            if (existingCase) {
                const isComplete = existingCase.status === 'COMPLETED';
                res.write(`data: ${JSON.stringify({
                    case_id: caseId,
                    phase: isComplete ? 'COMPLETE' : 'PROCESSING',
                    progress_percentage: isComplete ? 100 : 50,
                    message: "Connection restored. Syncing state...",
                    payload: existingCase
                })}\n\n`);

                if (isComplete) {
                    res.end();
                    return;
                }
            }
        } catch (err) {
            console.error(`[SSE] Hydration failed for ${caseId}:`, err);
            // Non-fatal, just don't hydrate
        }
    });

    const unsubscribe = sovereignEmitter.subscribe(caseId, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.phase === 'COMPLETE' || event.phase === 'ERROR') {
            res.end(); // Close connection on completion
        }
    });

    req.on('close', () => {
        console.log(`[SSE] Client disconnected for case ${caseId}`);
        unsubscribe();
    });
});

export default router;
