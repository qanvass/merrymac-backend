import express from 'express';
import { forensicEngine } from '../engines/forensic_engine';

const router = express.Router();

router.post('/scan', async (req, res) => {
    try {
        const { report } = req.body;
        if (!report) return res.status(400).json({ error: "Missing report data" });

        const analysis = await forensicEngine.scanReport(report);
        res.json(analysis);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
