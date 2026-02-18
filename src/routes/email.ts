import express from 'express';
import { emailService } from '../services/email';

const router = express.Router();

router.post('/send', async (req, res) => {
    try {
        const { to, subject, body } = req.body;
        const result = await emailService.sendEmail(to, subject, body);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/request-approval', async (req, res) => {
    try {
        const { context } = req.body;
        const result = await emailService.requestApproval(context);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/check-approvals', async (req, res) => {
    try {
        const approvals = await emailService.checkApprovals();
        res.json({ approvals });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
