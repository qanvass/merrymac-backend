import express from 'express';
import multer from 'multer';
import { vaultService } from '../services/vault';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), async (req: any, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const result = await vaultService.storeFile(
            req.file.originalname,
            req.file.buffer,
            req.file.mimetype
        );
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/download/:filename', async (req, res) => {
    try {
        const buffer = await vaultService.retrieveFile(req.params.filename);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(buffer);
    } catch (error: any) {
        res.status(404).json({ error: "File not found or access denied" });
    }
});

export default router;
