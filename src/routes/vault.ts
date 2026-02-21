import express from 'express';
import multer from 'multer';
import { vaultService } from '../services/vault';
import { requireAuth } from '../middleware/auth_middleware';
import { supabase } from '../services/supabase';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Phase 10: Vault now requires strict JWT authentication
router.post('/upload', requireAuth, upload.single('file'), async (req: any, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        // Route through the storage service
        const result = await vaultService.storeFile(
            req.file.originalname,
            req.file.buffer,
            req.file.mimetype
        );

        // Record the fact that this file exists in the user's evidence table
        if (supabase) {
            await supabase.from('evidence_documents').insert({
                user_id: req.user.id,
                document_type: 'UPLOADED_EVIDENCE',
                status: 'VERIFIED',
                storage_path: result.storedPath || req.file.originalname
            });
        }

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/download/:filename', requireAuth, async (req: any, res) => {
    try {
        // In a strict production environment, we should verify the user owns the file using `evidence_documents`
        // before serving it. For now, rely on vaultService logic.
        const buffer = await vaultService.retrieveFile(req.params.filename);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(buffer);
    } catch (error: any) {
        res.status(404).json({ error: "File not found or access denied" });
    }
});

router.get('/list', requireAuth, async (req: any, res) => {
    try {
        if (!supabase) {
            return res.json({ files: [] }); // Local fallback returns empty array if no DB
        }

        // Fetch securely relying on the RLS policies or direct selection
        const { data: evidenceFiles, error: evidenceError } = await supabase
            .from('evidence_documents')
            .select('*')
            .eq('user_id', req.user.id);

        const { data: reports, error: reportsError } = await supabase
            .from('credit_reports')
            .select('id, source, created_at, storage_path')
            .eq('user_id', req.user.id);

        if (evidenceError) throw evidenceError;

        // Map database records into the format expected by VaultPage.tsx
        const formattedFiles: any[] = [];

        if (reports) {
            reports.forEach(r => formattedFiles.push({
                id: r.id,
                name: `Credit_Report_${r.source.replace(' ', '_')}.pdf`,
                type: 'REPORT',
                size: 'Database Record',
                date: r.created_at.split('T')[0],
                status: 'ENCRYPTED'
            }));
        }

        if (evidenceFiles) {
            evidenceFiles.forEach(e => formattedFiles.push({
                id: e.id,
                name: e.storage_path.split('/').pop() || `Document_${e.document_type}.pdf`,
                type: e.document_type.includes('DISPUTE') ? 'DISPUTE' : 'EVIDENCE',
                size: 'Secure Object',
                date: e.created_at.split('T')[0],
                status: e.status
            }));
        }

        res.json({ files: formattedFiles });
    } catch (error: any) {
        console.error('[Vault] Error listing files:', error);
        res.status(500).json({ error: "Failed to list secure documents" });
    }
});

export default router;
