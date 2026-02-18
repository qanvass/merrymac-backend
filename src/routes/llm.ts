import express from 'express';
import { llmEngine } from '../engines/llm_engine';

const router = express.Router();

router.post('/analyze', async (req, res) => {
    try {
        const { report } = req.body;
        if (!report) return res.status(400).json({ error: "Missing report data" });

        const result = await llmEngine.analyzeReport(report);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
