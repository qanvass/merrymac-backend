import express from 'express';
import multer from 'multer';
const pdfParse = require('pdf-parse');
import { requireAuth } from '../middleware/auth_middleware';
import { sovereignEngine } from '../engine/sovereign_engine';
import { sovereignEmitter } from '../events/sovereign_events';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });


router.get('/health', (req, res) => {
    res.json({ status: 'ingestion_active', time: new Date().toISOString() });
});

router.post('/upload', requireAuth, upload.single('file'), async (req: any, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No PDF file uploaded in 'file' field." });
        }

        console.log(`[Ingestion] Received PDF: ${req.file.originalname} (${req.file.size} bytes)`);

        // Parse the PDF buffer using pdf-parse
        let reportText = "";
        try {
            const data = await pdfParse(req.file.buffer);
            reportText = data.text;
            console.log(`[Ingestion] Extracted ${reportText.length} characters from PDF.`);
        } catch (parseError) {
            console.error("[Ingestion] PDF Parsing failed:", parseError);
            return res.status(422).json({ error: "Could not extract text from the provided PDF. It might be encrypted or corrupted." });
        }

        if (!reportText || reportText.trim() === "") {
            return res.status(422).json({ error: "Extracted PDF text is empty." });
        }

        const caseId = uuidv4();
        const fileMetadata = { name: req.file.originalname, size: req.file.size };

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
    import('../engine/sovereign_engine').then(async ({ CaseMemory }) => {
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

    // Heartbeat: keeps Railway/proxy from closing idle SSE connections during LLM processing
    const heartbeat = setInterval(() => {
        res.write(': ping\n\n');
    }, 20000);

    const unsubscribe = sovereignEmitter.subscribe(caseId, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.phase === 'COMPLETE' || event.phase === 'ERROR') {
            clearInterval(heartbeat);
            res.end(); // Close connection on completion
        }
    });

    req.on('close', () => {
        console.log(`[SSE] Client disconnected for case ${caseId}`);
        clearInterval(heartbeat);
        unsubscribe();
    });
});

export default router;
