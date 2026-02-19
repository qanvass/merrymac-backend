
import express from 'express';
import { automationService } from '../services/automation_service';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Store for automation results (In-memory for now, could be DB backed)
const automationJobs: Record<string, any> = {};

router.post('/cfpb', async (req, res) => {
    try {
        const { caseId, violations } = req.body;

        if (!caseId || !violations) {
            return res.status(400).json({ error: "Missing caseId or violations payload" });
        }

        // REAL Automation via Playwright
        const result = await automationService.submitComplaint(caseId, violations);
        const jobResult = {
            ...result,
            timestamp: new Date().toISOString()
        };

        automationJobs[result.id] = jobResult;

        console.log(`[Automation] CFPB Complaint Processed: ${result.id}`);

        // Return 200 with REAL ID (Not 204 or empty)
        res.status(200).json(jobResult);

    } catch (error: any) {
        console.error("Automation Error:", error);
        res.status(500).json({ error: "Automation Sequence Failed" });
    }
});

router.get('/status/:id', (req, res) => {
    const job = automationJobs[req.params.id];
    if (job) res.json(job);
    else res.status(404).json({ error: "Job not found" });
});

export default router;
