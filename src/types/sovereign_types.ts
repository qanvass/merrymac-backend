export interface CanonicalTradeline {
    id: string; // Unique ID (e.g., "TL-001")
    bureau: 'Experian' | 'TransUnion' | 'Equifax' | 'Unknown';
    creditor: string;
    account_number: string; // Partial or full
    account_type: string; // e.g., "Revolving", "Installment"
    date_opened: string | null; // ISO 8601
    date_last_active: string | null; // DLA
    date_of_first_delinquency: string | null; // DOFD (Critical for 7-year rule)
    date_status: string | null; // Date of current status
    status_code: string; // e.g., "I1", "R9", "Charge-off"
    balance: number;
    credit_limit: number;
    past_due_amount: number;
    payment_history_grid: string[]; // Raw monthly codes: ["OK", "30", "60", ...]
    remarks: string[];
    is_disputed: boolean;
}

export interface CanonicalPublicRecord {
    id: string;
    type: 'Bankruptcy' | 'Judgment' | 'Lien';
    reference_number: string;
    court: string;
    date_filed: string | null;
    status: string;
    amount: number;
    plaintiff?: string; // For judgments
}

export interface CanonicalInquiry {
    id: string;
    bureau: 'Experian' | 'TransUnion' | 'Equifax';
    creditor: string;
    date_inquiry: string; // ISO 8601
    permissible_purpose?: string; // e.g., "Credit Review"
}

export interface CanonicalCase {
    case_id: string;
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED'; // State Machine Persistence // UUID
    consumer_identity: {
        name: string;
        ssn_partial: string;
        dob: string | null;
        current_address: string;
        previous_addresses: string[];
        employers: string[];
    };
    bureau_sources: string[]; // ["Experian", "TransUnion"]
    tradelines: CanonicalTradeline[];
    public_records: CanonicalPublicRecord[];
    inquiries: CanonicalInquiry[];

    // Raw Storage for Forensic Audit
    raw_text_blocks: string[];
    extracted_tables: any[]; // JSON representation of tables

    // Computation
    metrics: {
        total_utilization: number;
        average_age_of_credit: number; // Months
        oldest_account_age: number; // Months
        total_inquiries_last_12m: number;
    };

    metadata: {
        ingestion_date: string;
        file_hash: string; // For de-duplication
        processing_time_ms: number;
    };

    // Phase 2 output
    findings: ForensicFinding[];
}

// Sovereign SSE Event for UI Streaming
export interface SovereignEvent {
    case_id: string;
    phase: 'INITIALIZING' | 'PARSING_TEXT' | 'EXTRACTING_TRADELINES' | 'VALIDATING_METRO2' | 'SCORING' | 'COMPLETE' | 'ERROR';
    progress_percentage: number;
    message: string;
    payload?: any; // Partial data or final result
}

export interface ForensicFinding {
    rule_id: string; // e.g., "FCRA-623"
    severity: number; // 0-100
    confidence: number; // 0-100
    description: string;
    statute: string; // e.g., "15 U.S.C. § 1681s-2(a)(1)(A)"
    remedy: string; // e.g., "Direct Dispute w/ Furnisher"
    estimated_value: number; // Statutory damages or deletions
    related_entity_id: string; // ID of tradeline/inquiry
}
