import express from 'express';
import { scoringEngine } from '../engines/scoring_engine';

const router = express.Router();

router.post('/simulate', (req, res) => {
    try {
        const { report } = req.body;
        if (!report) return res.status(400).json({ error: "Missing report data" });

        const result = scoringEngine.simulate(report);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
