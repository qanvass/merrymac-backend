
import express from 'express';
import { automationService } from '../services/automation_service';
import { orchestrationEngine } from '../engine/orchestration_engine';
import { CaseMemory } from '../engine/sovereign_engine';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Store for automation results and orchestration plans
const automationJobs: Record<string, any> = {};
const orchestrationPlans: Record<string, any> = {};

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
        res.status(200).json(jobResult);

    } catch (error: any) {
        console.error("Automation Error:", error);
        res.status(500).json({ error: "Automation Sequence Failed" });
    }
});

// Orchestration Endpoints
router.post('/plan/generate', async (req, res) => {
    try {
        const { caseId } = req.body;
        if (!caseId) return res.status(400).json({ error: "Missing caseId" });

        const caseData = await CaseMemory.load(caseId);
        if (!caseData) return res.status(404).json({ error: "Case not found" });

        const plan = await orchestrationEngine.generatePlan(caseData);
        orchestrationPlans[plan.id] = plan;

        console.log(`[Orchestration] Plan Generated: ${plan.id} for Case ${caseId}`);
        res.status(200).json(plan);
    } catch (error: any) {
        console.error("Planning Error:", error);
        res.status(500).json({ error: "Failed to generate orchestration plan" });
    }
});


import { jobService } from '../services/job_service';

router.post('/plan/execute', async (req, res) => {
    try {
        const { planId, stepId } = req.body;
        if (!planId || !stepId) return res.status(400).json({ error: "Missing planId or stepId" });

        const plan = orchestrationPlans[planId];
        if (!plan) return res.status(404).json({ error: "Plan not found" });

        // CREATE BACKGROUND JOB
        const job = jobService.createJob('PLAN_EXECUTION', { planId, stepId });

        // Non-blocking run
        jobService.runJob(job.id, async () => {
            const updatedPlan = await orchestrationEngine.executeStep(plan, stepId);
            orchestrationPlans[planId] = updatedPlan;
            return updatedPlan;
        });

        res.status(202).json({ jobId: job.id, message: "Execution started" });
    } catch (error: any) {
        console.error("Execution Error:", error);
        res.status(500).json({ error: error.message || "Failed to initiate execution" });
    }
});

router.get('/status/:id', (req, res) => {
    const job = automationJobs[req.params.id];
    if (job) res.json(job);
    else res.status(404).json({ error: "Job not found" });
});

router.get('/plan/:id', (req, res) => {
    const plan = orchestrationPlans[req.params.id];
    if (plan) res.json(plan);
    else res.status(404).json({ error: "Plan not found" });
});

export default router;
