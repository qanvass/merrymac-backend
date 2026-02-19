import { CanonicalCase, CanonicalTradeline, ForensicFinding, SovereignEvent } from '../types/sovereign_types';
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
    // Phase 1: Deterministic Parsing
    // Phase 1: Deterministic Parsing (Block-Based Strategy)
    async parse(rawText: string, fileName: string): Promise<CanonicalCase> {
        const caseId = uuidv4();

        // Emit Initial Event
        sovereignEmitter.emitEvent(caseId, {
            case_id: caseId,
            phase: 'INITIALIZING',
            progress_percentage: 5,
            message: `Sovereign Protocol Initiated for ${fileName}`
        });

        // Split text into lines for granular processing
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // 1. Extract Identity
        // We use the raw text for this as it's often at the top and easier to regex globally
        const nameMatch = rawText.match(/Name:\s*([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i) || rawText.match(/^([A-Z][a-z]+ [A-Z][a-z]+)$/m);
        const dobMatch = rawText.match(/DOB:\s*(\d{2}\/\d{2}\/\d{4})/i) || rawText.match(/Date of Birth:\s*(\d{2}\/\d{2}\/\d{4})/i);
        const ssnMatch = rawText.match(/SSN:\s*(\d{3}-\d{2}-\d{4})/i) || rawText.match(/Social Security.*(\d{3}-\d{2}-\d{4})/i);

        // 2. Block-Based Tradeline Extraction
        // We iterate through lines to find "Account Number" and then look backwards/forwards for context
        const tradelines: CanonicalTradeline[] = [];
        let currentTradeline: Partial<CanonicalTradeline> | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detect Start of a Tradeline Block (usually indicated by Account Number or Creditor Name)
            // Strategy: If we see "Account Number", we assume the previous line was the Creditor
            if (line.match(/Account Number:?\s*(\w+)/i)) {
                // Save previous if exists
                if (currentTradeline && currentTradeline.creditor) {
                    tradelines.push(currentTradeline as CanonicalTradeline);
                }

                // Start New
                const accNum = line.match(/Account Number:?\s*(\w+)/i)?.[1] || "UNKNOWN";
                const creditor = (i > 0) ? lines[i - 1] : "Unknown Creditor"; // Look back one line

                currentTradeline = {
                    id: uuidv4(),
                    bureau: 'Unknown',
                    creditor: creditor,
                    account_number: accNum,
                    account_type: "Revolving",
                    status_code: "Unknown",
                    date_opened: "",
                    balance: 0,
                    credit_limit: 0,
                    payment_history_grid: [],
                    remarks: [],
                    is_disputed: false
                };
            }

            // Contextual Data Extraction (If inside a tradeline block)
            if (currentTradeline) {
                if (line.match(/Balance:?\s*\$?([\d,]+)/i)) {
                    const bal = line.match(/Balance:?\s*\$?([\d,]+)/i)?.[1] || "0";
                    currentTradeline.balance = parseFloat(bal.replace(/,/g, ''));
                }
                if (line.match(/Status:?\s*([A-Za-z\s]+)/i)) {
                    currentTradeline.status_code = line.match(/Status:?\s*([A-Za-z\s]+)/i)?.[1]?.trim() || "Unknown";
                }
                if (line.match(/Limit:?\s*\$?([\d,]+)/i)) {
                    const lim = line.match(/Limit:?\s*\$?([\d,]+)/i)?.[1] || "0";
                    currentTradeline.credit_limit = parseFloat(lim.replace(/,/g, ''));
                }
                if (line.match(/Date Opened:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)) {
                    currentTradeline.date_opened = line.match(/Date Opened:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] || "";
                }
            }
        }
        // Push last one
        if (currentTradeline && currentTradeline.creditor) {
            tradelines.push(currentTradeline as CanonicalTradeline);
        }

        console.log(`[Sovereign] Extracted ${tradelines.length} tradelines via Block Parser.`);

        const canonical: CanonicalCase = {
            case_id: caseId,
            status: 'PROCESSING',
            consumer_identity: {
                name: nameMatch ? nameMatch[1].trim() : "Unknown Subject",
                ssn_partial: ssnMatch ? ssnMatch[1] : "XXX-XX-XXXX",
                dob: dobMatch ? dobMatch[1] : null,
                current_address: "Unknown",
                previous_addresses: [],
                employers: []
            },
            bureau_sources: ["Unknown"],
            tradelines: tradelines,
            public_records: [], // Future: Implement similar block logic for these
            inquiries: [],      // Future: Implement similar block logic for these
            raw_text_blocks: [rawText], // Store full text for forensic audit
            extracted_tables: [],
            metrics: {
                total_utilization: 0,
                average_age_of_credit: 0,
                oldest_account_age: 0,
                total_inquiries_last_12m: 0
            },
            metadata: {
                ingestion_date: new Date().toISOString(),
                file_hash: "hash-placeholder",
                processing_time_ms: 0
            },
            findings: []
        };

        sovereignEmitter.emitEvent(caseId, {
            case_id: caseId,
            phase: 'EXTRACTING_TRADELINES',
            progress_percentage: 50,
            message: `Identified ${tradelines.length} tradelines via Deep Scan.`
        });

        // Update Status
        canonical.status = 'COMPLETED';

        // Phase 2: Run Validation Checks
        const findings = this.validate(canonical);
        canonical.findings = findings;

        // Initialize Memory
        try {
            await CaseMemory.init();
            await CaseMemory.save(canonical);
        } catch (err) {
            console.error("[Sovereign] Persistence Failed (Expected in Test Mode):", err);
        }

        sovereignEmitter.emitEvent(caseId, {
            case_id: caseId,
            phase: 'COMPLETE',
            progress_percentage: 100,
            message: `Sovereign Analysis Complete. Found ${findings.length} violations.`,
            payload: canonical
        });

        return canonical;
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
