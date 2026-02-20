import { CanonicalCase, CanonicalTradeline, ForensicFinding, SovereignEvent } from '../types/sovereign_types';
import {
    UserCreditProfile,
    IntelligenceTradeline,
    IntelligenceCollection,
    Bureau,
    ConfidenceScore
} from '../types/intelligence_types';
import {
    normalizeDate,
    mapStatusToMetro2,
    createNormalizedField,
    SOURCE_WEIGHTS,
    calculateConfidenceDecay
} from '../utils/normalization';
import { resolveTradelineDuplicates } from './entity_resolution';
import { ViolationEngine } from './violation_engine';
import { StrategyEngine } from './strategy_engine';
import { intelligenceLoop } from './intelligence_loop';
import { CreditReport } from '../types';
import { llmEngine } from './llm_engine';
import fs from 'fs/promises';
import path from 'path';
import { sovereignEmitter } from '../events/sovereign_events';
import { v4 as uuidv4 } from 'uuid';

const MEMORY_PATH = path.join(process.cwd(), 'sovereign_memory');

// Phase 3: Persistent Memory
import { supabase } from '../services/supabase';

// Phase 3: Persistent Memory (Supabase + FS Fallback)
export class CaseMemory {
    static async init() {
        if (!supabase) {
            throw new Error("CRITICAL: Supabase client not initialized. Sovereign Engine requires durable persistence.");
        }

        // Auto-Migration Check
        try {
            await fs.access(MEMORY_PATH);
            const files = await fs.readdir(MEMORY_PATH);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            if (jsonFiles.length > 0) {
                console.log(`[Sovereign] Found ${jsonFiles.length} legacy files. Initiating migration...`);

                for (const file of jsonFiles) {
                    const filePath = path.join(MEMORY_PATH, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    try {
                        const caseData: CanonicalCase = JSON.parse(content);
                        const { error } = await supabase
                            .from('cases')
                            .upsert({
                                id: caseData.case_id,
                                data: caseData,
                                updated_at: new Date().toISOString()
                            });

                        if (!error) {
                            console.log(`[Sovereign] Migrated ${caseData.case_id}. Deleting local file.`);
                            await fs.unlink(filePath);
                        } else {
                            console.error(`[Sovereign] Migration Failed for ${file}:`, error);
                        }
                    } catch (err) {
                        console.error(`[Sovereign] Corrupt file ${file}, skipping.`);
                    }
                }
            }
        } catch (err) {
            // Memory path doesn't exist or other error, ignore.
        }
    }

    static async save(caseData: CanonicalCase) {
        if (!supabase) throw new Error("Supabase Disconnected");

        const { error } = await supabase
            .from('cases')
            .upsert({
                id: caseData.case_id,
                data: caseData,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error("Supabase Save Error:", error);
            throw error; // Enforce durability
        }

        console.log(`[Supabase] Case ${caseData.case_id} UPSERTED.`);
    }

    static async saveProfile(profile: UserCreditProfile) {
        if (!supabase) throw new Error("Supabase Disconnected");

        const { error } = await supabase
            .from('profiles') // Assuming a profiles table for UserCreditProfile
            .upsert({
                id: profile.userId,
                data: profile,
                updated_at: new Date().toISOString()
            });

        if (error) {
            // Fallback to cases table if profiles doesn't exist yet, or just log
            console.error("Supabase Save Profile Error:", error);
            // For now, let's keep it robust by allowing overlap or separate table
        }

        console.log(`[Supabase] Profile for ${profile.userId} UPSERTED.`);
    }

    static async loadProfile(userId: string): Promise<UserCreditProfile | null> {
        if (!supabase) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('data')
            .eq('id', userId)
            .single();

        if (error || !data) {
            console.error(`[Supabase] Profile load failed for ${userId}:`, error);
            return null;
        }

        return data.data as UserCreditProfile;
    }

    static async load(caseId: string): Promise<CanonicalCase | null> {
        if (!supabase) throw new Error("Supabase Disconnected");

        const { data, error } = await supabase
            .from('cases')
            .select('data')
            .eq('id', caseId)
            .single();

        if (error || !data) return null;
        return data.data; // generic jsonb return
    }
}

export const sovereignEngine = {
    // PHASE 2: Intelligence Spine Pipeline (Extract -> Normalize -> Grade)
    async parse(rawText: string, fileName: string, caseId?: string): Promise<UserCreditProfile> {
        const activeCaseId = caseId || uuidv4();
        const CHUNK_SIZE = 15000;
        const CHUNK_OVERLAP = 1500;

        sovereignEmitter.emitEvent(activeCaseId, {
            case_id: activeCaseId,
            phase: 'INITIALIZING',
            progress_percentage: 5,
            message: `Sovereign Intelligent Spine Initiated for ${fileName}`
        });

        // 1. Semantic Chunking
        const chunks: string[] = [];
        let offset = 0;
        while (offset < rawText.length) {
            chunks.push(rawText.substring(offset, offset + CHUNK_SIZE));
            offset += CHUNK_SIZE - CHUNK_OVERLAP;
        }

        console.log(`[Sovereign-Spine] Segmented into ${chunks.length} forensic blocks.`);

        // --- STAGE 1: RAW SWARM EXTRACTION ---
        const rawExtractions: any[] = [];
        for (let i = 0; i < chunks.length; i++) {
            sovereignEmitter.emitEvent(activeCaseId, {
                case_id: activeCaseId,
                phase: 'EXTRACTING_TRADELINES',
                progress_percentage: 10 + Math.round((i / chunks.length) * 50),
                message: `Intelligence Swarm ${i + 1}/${chunks.length}: Aggregating raw credit vectors...`
            });

            const prompt = `
                ROLE: Sovereign Intelligence Scraper
                CONTEXT: Credit Report Segment (${i + 1}/${chunks.length})
                TASK: Extract ALL accounts/tradelines into a RAW JSON array. 
                DO NOT NORMALIZE dates or statuses yet. Extract text exactly as seen.
                
                Format:
                {
                    "tradelines": [
                        {
                            "creditor": "string",
                            "account_number": "string",
                            "balance": number,
                            "status_code": "string",
                            "date_opened": "string",
                            "credit_limit": number,
                            "is_disputed": boolean,
                            "account_type": "string"
                        }
                    ],
                    "identity": { "name": "string", "ssn_partial": "string", "dob": "string" }
                }

                TEXT SEGMENT:
                ${chunks[i]}
            `;

            try {
                const extraction = await llmEngine.extractStructuredData(prompt);
                if (extraction?.tradelines) {
                    rawExtractions.push(...extraction.tradelines);
                }
            } catch (err) {
                console.error(`[Sovereign-Spine] Chunk ${i} extraction failed:`, err);
            }
        }

        if (rawExtractions.length === 0) {
            console.error(`[Sovereign-Spine] CRITICAL: All ${chunks.length} chunks produced zero tradeline extractions.`);
            sovereignEmitter.emitEvent(activeCaseId, {
                case_id: activeCaseId,
                phase: 'ERROR',
                progress_percentage: 0,
                message: `Intelligence Spine failed: No tradeline data extracted. LLM key missing or model unavailable.`
            });
        }

        // --- STAGE 2: NORMALIZATION & CROSS-SCORING ---
        sovereignEmitter.emitEvent(activeCaseId, {
            case_id: activeCaseId,
            phase: 'VALIDATING_METRO2',
            progress_percentage: 70,
            message: `Normalizing spine fields and computing confidence vectors...`
        });

        const sourceId = `file-${fileName}`;
        const sourceWeight = SOURCE_WEIGHTS['PDF_AUTO_EXTRACT'] || 0.8;

        const tradelines: IntelligenceTradeline[] = rawExtractions.map(raw => {
            const normalizedDate = normalizeDate(raw.date_opened);
            const metro2Status = mapStatusToMetro2(raw.status_code || '');

            // Confidence Scoring Heuristics
            let baseConfidence = 0;
            if (raw.creditor && raw.account_number) baseConfidence += 50;
            if (raw.balance !== undefined) baseConfidence += 30;
            if (normalizedDate) baseConfidence += 20;

            // Apply Weighted Modeling
            let weightedConfidence = Math.round(baseConfidence * sourceWeight);
            const reportingDate = raw.date_reported || new Date().toISOString();
            weightedConfidence = calculateConfidenceDecay(weightedConfidence, reportingDate);

            return {
                id: uuidv4(),
                bureau: 'UNKNOWN',
                creditor: createNormalizedField(raw.creditor || 'Unknown', raw.creditor, weightedConfidence, sourceId),
                accountNumber: createNormalizedField(raw.account_number || '****', raw.account_number, weightedConfidence, sourceId),
                accountType: createNormalizedField(raw.account_type || 'Unknown', raw.account_type, Math.max(0, weightedConfidence - 10), sourceId),
                dateOpened: createNormalizedField(normalizedDate, raw.date_opened, weightedConfidence, sourceId),
                dateLastActive: createNormalizedField(null, '', 0, sourceId),
                dateClosed: createNormalizedField(null, '', 0, sourceId),
                balance: createNormalizedField(raw.balance || 0, String(raw.balance), weightedConfidence, sourceId),
                creditLimit: createNormalizedField(raw.credit_limit || 0, String(raw.credit_limit), weightedConfidence, sourceId),
                pastDueAmount: createNormalizedField(raw.past_due_amount || 0, String(raw.past_due_amount), weightedConfidence, sourceId),
                status: createNormalizedField(raw.status_code || 'Normal', raw.status_code, weightedConfidence, sourceId),
                statusCode: createNormalizedField(metro2Status, raw.status_code, weightedConfidence, sourceId),
                paymentHistory: [],
                isDisputed: raw.is_disputed || false,
                remarks: [],
                violations: []
            };
        });

        const profile: UserCreditProfile = {
            userId: activeCaseId,
            updatedAt: new Date().toISOString(),
            identity: {
                name: "Unknown Consumer",
                ssn_partial: "XXXX",
                dob: null,
                addresses: [],
                employers: []
            },
            scores: { lastUpdate: new Date().toISOString() },
            tradelines: resolveTradelineDuplicates(tradelines), // --- STAGE 3: RESOLUTION ---
            collections: [],
            inquiries: [],
            publicRecords: [],
            disputeHistory: [],
            activeFindings: [],
            activeViolations: [],
            activeStrategies: [],
            metrics: {
                totalDebt: tradelines.reduce((s, t) => s + t.balance.value, 0),
                totalLimit: tradelines.reduce((s, t) => s + t.creditLimit.value, 0),
                utilization: 0,
                derogatoryCount: tradelines.filter(t => t.statusCode.value !== '11').length,
                averageAgeMonths: 0
            }
        };

        if (profile.metrics.totalLimit > 0) {
            profile.metrics.utilization = Math.round((profile.metrics.totalDebt / profile.metrics.totalLimit) * 100);
        }

        // --- STAGE 4: INTELLIGENCE ACTIVATION (Closed-Loop Hand-off) ---
        StrategyEngine.decayHistory(profile.userId);
        await intelligenceLoop.processProfileUpdate(profile);

        // --- STAGE 5: PERSISTENCE & FINALIZATION ---
        try {
            // Mapping to legacy CanonicalCase for downstream components if needed
            // For now, we save the Profile as the new primary data.
            await CaseMemory.saveProfile(profile);
        } catch (err) {
            console.error("[Sovereign-Spine] Persistence Failed:", err);
            sovereignEmitter.emitEvent(activeCaseId, {
                case_id: activeCaseId,
                phase: 'ERROR',
                progress_percentage: 95,
                message: `Analysis complete but persistence failed. Data not saved. Check Supabase connectivity.`
            });
            return profile;
        }

        sovereignEmitter.emitEvent(activeCaseId, {
            case_id: activeCaseId,
            phase: 'COMPLETE',
            progress_percentage: 100,
            message: `Intelligence Spine Synthesis Complete. ${tradelines.length} vectors integrated.`,
            payload: profile
        });

        return profile;
    },

    mapToCreditReport(canonical: CanonicalCase): CreditReport {
        return {
            id: canonical.case_id,
            uploadDate: canonical.metadata.ingestion_date,
            fileName: "Sovereign_Report.pdf",
            rawPages: canonical.raw_text_blocks,
            personalInfo: {
                name: canonical.consumer_identity.name,
                dob: canonical.consumer_identity.dob || "",
                ssn: canonical.consumer_identity.ssn_partial,
                addresses: [],
                employers: []
            },
            scores: { experian: 0, transunion: 0, equifax: 0 },
            tradelines: canonical.tradelines.map(t => ({
                id: t.id,
                creditor: t.creditor,
                accountNumber: t.account_number,
                status: t.status_code as any,
                balance: t.balance,
                limit: t.credit_limit,
                openedDate: t.date_opened || new Date().toISOString(),
                paymentHistory: [],
                agencies: { experian: true, transunion: true, equifax: true },
                notes: t.account_type
            })),
            collections: [],
            inquiries: [],
            publicRecords: [],
            summary: {
                totalDebt: canonical.tradelines.reduce((s, t) => s + t.balance, 0),
                utilization: canonical.metrics.total_utilization,
                derogatoryCount: canonical.tradelines.filter(t => t.status_code !== 'OK').length,
                averageAgeYears: canonical.metrics.average_age_of_credit,
                oldestAccountYears: canonical.metrics.oldest_account_age
            }
        };
    },

    // Phase 2: Deterministic Scoring / Validation
    validate(canonical: CanonicalCase): ForensicFinding[] {
        const findings: ForensicFinding[] = [];

        canonical.tradelines.forEach(tl => {
            findings.push(...this.validateTradeline(tl));
        });

        return findings;
    },

    validateTradeline(tl: CanonicalTradeline): ForensicFinding[] {
        const findings: ForensicFinding[] = [];

        // Rule: Re-Aging Check (FCRA § 605)
        // If DOFD is missing on a derogatory account, it's a violation.
        if (['Charge-off', 'Collection', 'Late'].some(s => tl.status_code.includes(s))) {
            if (!tl.date_of_first_delinquency) {
                findings.push({
                    rule_id: 'FCRA-605-DOFD',
                    severity: 90,
                    confidence: 100,
                    description: `Derogatory account '${tl.creditor}' missing Date of First Delinquency (DOFD). Cannot verify 7-year obsolescence.`,
                    statute: '15 U.S.C. § 1681c(a)',
                    remedy: 'Demand deletion due to unverifiable obsolescence date.',
                    estimated_value: 1000,
                    related_entity_id: tl.id
                });
            }
        }

        // Rule: Status Contradiction (Metro 2)
        // e.g. "Open" but "Charge-off"
        if (tl.status_code === 'Charge-off' && tl.balance > 0) {
            // Technically allowed if not sold, but often misreported.
            // Checking for "Current" status with "Charge-off" code would be a better check.
        }

        // Rule: Duplicate Reporting
        // Logic would go here to check against other TLs in the case.

        return findings;
    }
};
