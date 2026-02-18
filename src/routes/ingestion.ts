import express from 'express';
import { ingestionEngine } from '../engines/ingestion_engine';

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

        const reportId = await ingestionEngine.processUpload(reportText, {
            fileName: fileMetadata.name,
            pageCount: pageCount
        });

        // Sovereign Requirement: Return report_id only
        res.json({ reportId });

    } catch (error: any) {
        console.error("Ingestion Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
