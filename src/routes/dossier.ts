import { Router } from 'express';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { supabase } from '../services/supabase';

const router = Router();

function hashPayload(payload: object): string {
    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

router.post('/generate', async (req, res) => {
    try {
        const dossier = req.body;
        const providedHash = dossier.cryptographicHash;

        if (!providedHash) {
            return res.status(400).json({ error: "Missing cryptographic hash." });
        }

        // Construct object without hash and CoC for verification
        const { cryptographicHash, chainOfCustody, ...dossierWithoutHash } = dossier;

        const recalculatedHash = hashPayload(dossierWithoutHash);

        if (recalculatedHash !== providedHash) {
            return res.status(403).json({ error: "Hash mismatch - integrity failure." });
        }

        // Generate PDF
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));

        const finalizePdf = new Promise<Buffer>((resolve) => {
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });

        // --- PDF LAYOUT ---
        doc.fontSize(20).text('MERRYMAC PRESTIGE', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('ENFORCEMENT DOSSIER', { align: 'center' });
        doc.moveDown(2);

        doc.fontSize(12).text(`Dossier ID: ${dossier.dossierId}`);
        doc.text(`Tradeline ID: ${dossier.tradelineId}`);
        doc.text(`Generated At: ${dossier.generatedAt}`);
        doc.text(`Integrity Hash: ${providedHash}`);
        doc.moveDown();

        doc.fontSize(14).text('EXECUTIVE SUMMARY', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Creditor: ${dossier.creditor.canonicalName} (${dossier.creditor.creditorType})`);
        doc.text(`Bureau Target: ${dossier.bureau.bureau.toUpperCase()}`);
        doc.text(`Enforcement Temperature: ${(dossier.enforcementTemperature * 100).toFixed(1)}°`);
        doc.text(`Recommended Action: ${dossier.recommendedAction}`);
        doc.moveDown();

        doc.fontSize(14).text('VIOLATION MATRIX', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Primary Codes: ${dossier.violationAnalysis.violationCodes.join(', ')}`);
        doc.text(`Violation Score: ${dossier.violationAnalysis.violationScore}`);
        doc.text(`Metro 2 Conflict Score: ${dossier.metro2Score}`);
        doc.moveDown();

        doc.fontSize(14).text('STATUTE OF LIMITATIONS ANALYSIS', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Governing State: ${dossier.solAnalysis.governingState}`);
        doc.text(`Accrual Date: ${dossier.solAnalysis.accrualDate}`);
        doc.text(`Expiration Date: ${dossier.solAnalysis.expirationDate}`);
        doc.text(`Expired Flag: ${dossier.solAnalysis.expired ? 'TRUE (Time-Barred)' : 'FALSE (Active)'}`);
        doc.moveDown();

        doc.fontSize(14).text('ROI & FINANCIAL MODELING', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Expected Value: $${dossier.roiAnalysis.expectedValue.toLocaleString()}`);
        doc.text(`Success Probability: ${(dossier.roiAnalysis.successProbability * 100).toFixed(1)}%`);
        doc.text(`Estimated Recovery: $${dossier.roiAnalysis.estimatedRecovery.toLocaleString()}`);
        doc.moveDown();

        doc.fontSize(14).text('SETTLEMENT OPTIMIZATION WINDOW', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Expected Settlement: $${dossier.settlementAnalysis.expectedSettlement.toLocaleString()}`);
        doc.text(`Minimum Acceptable: $${dossier.settlementAnalysis.minimumAcceptable.toLocaleString()}`);
        doc.text(`Aggressive Target: $${dossier.settlementAnalysis.aggressiveTarget.toLocaleString()}`);
        doc.moveDown();

        doc.fontSize(14).text('STATUTORY CITATIONS', { underline: true });
        doc.moveDown(0.5);
        dossier.statutoryCitations.forEach((cit: string) => {
            doc.fontSize(10).text(`• ${cit}`);
        });

        // Footer injection
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            const oldBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.fontSize(8).fillColor('grey').text(
                `Hash: ${providedHash} | Page ${i + 1} of ${pages.count}`,
                50,
                doc.page.height - 50,
                { align: 'center' }
            );
            doc.page.margins.bottom = oldBottom;
        }

        doc.end();
        const pdfBuffer = await finalizePdf;
        const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

        // Supabase Vault Storage
        if (supabase) {
            const { data: dossierRow, error: dossierError } = await supabase
                .from('dossiers')
                .insert([{
                    tradeline_id: dossier.tradelineId,
                    consumer_id: dossier.consumerId || '00000000-0000-0000-0000-000000000000',
                    dossier_hash: providedHash,
                    pdf_hash: pdfHash,
                    version: dossier.version
                }])
                .select('id')
                .single();

            if (!dossierError && dossierRow) {
                await supabase.from('dossier_events').insert([{
                    dossier_id: dossierRow.id,
                    event_type: 'PDF_GENERATED',
                    event_hash: pdfHash
                }]);
            }
        }

        const base64Pdf = pdfBuffer.toString('base64');
        const dataUrl = `data:application/pdf;base64,${base64Pdf}`;

        res.json({
            success: true,
            downloadUrl: dataUrl,
            pdfHash
        });

    } catch (e: any) {
        console.error("Dossier Generation Error:", e);
        res.status(500).json({ error: "Failed to generate dossier." });
    }
});

export default router;
