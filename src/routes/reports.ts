import express from 'express';
import { vaultService } from '../services/vault';

const router = express.Router();

router.get('/:id', async (req, res) => {
    try {
        const reportId = req.params.id;
        if (!reportId) return res.status(400).json({ error: "Missing Report ID" });

        // Retrieve PARSED json from Vault
        const filename = `${reportId}_PARSED.json`;
        const buffer = await vaultService.retrieveFile(filename);

        const reportData = JSON.parse(buffer.toString());
        res.json(reportData);
    } catch (error: any) {
        console.error("Report Retrieval ErrorDuplicate:", error);
        res.status(404).json({ error: "Report not found or access denied." });
    }
});

export default router;
