
import express from 'express';
import { jobService } from '../services/job_service';

const router = express.Router();

router.get('/:id', (req, res) => {
    const job = jobService.getJob(req.params.id);
    if (job) {
        res.json(job);
    } else {
        res.status(404).json({ error: 'Job not found' });
    }
});

router.get('/', (req, res) => {
    res.json(jobService.listJobs());
});

export default router;
