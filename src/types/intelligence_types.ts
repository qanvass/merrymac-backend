import { ForensicFinding } from './sovereign_types';

export interface Violation {
    id: string;
    rule_id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    statute: string; // e.g., "FCRA § 623"
    remedy: string;
    confidence: number;
    relatedEntityId: string; // Tradeline/Collection ID
}

export interface EnforcementStrategy {
    id: string;
    type: 'DISPUTE' | '605B_BLOCK' | 'CFPB_COMPLAINT' | 'ESCALATION' | 'MONITOR';
    targetEntityId: string;
    violationIds: string[];
    removalProbability: number; // 0-100
    litigationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    precedentStrength?: number;
    recommendedAction: string;
    declarativeMetadata: Record<string, any>;
}

export type Bureau = 'EXPERIAN' | 'TRANSUNION' | 'EQUIFAX' | 'UNKNOWN';
export type ConfidenceScore = number; // 0-100

export interface NormalizedField<T> {
    value: T;
    originalValue: string;
    confidence: ConfidenceScore;
    source: string; // ID of the source document/connector
}

export interface IntelligenceTradeline {
    id: string;
    bureau: Bureau;
    creditor: NormalizedField<string>;
    accountNumber: NormalizedField<string>;
    accountType: NormalizedField<string>;
    dateOpened: NormalizedField<string | null>;
    dateLastActive: NormalizedField<string | null>;
    dateClosed: NormalizedField<string | null>;
    balance: NormalizedField<number>;
    creditLimit: NormalizedField<number>;
    pastDueAmount: NormalizedField<number>;
    status: NormalizedField<string>;
    statusCode: NormalizedField<string>; // Metro 2 mapping
    paymentHistory: string[];
    isDisputed: boolean;
    remarks: string[];
    violations: Violation[];
}

export interface IntelligenceCollection {
    id: string;
    bureau: Bureau;
    collectionAgency: NormalizedField<string>;
    originalCreditor: NormalizedField<string>;
    dateOpened: NormalizedField<string>;
    amount: NormalizedField<number>;
    status: NormalizedField<'UNPAID' | 'PAID' | 'SETTLED'>;
    accountNumber: NormalizedField<string>;
    originalAccountNumber?: string;
    violations: Violation[];
}

export interface IntelligenceInquiry {
    id: string;
    bureau: Bureau;
    creditor: NormalizedField<string>;
    date: NormalizedField<string>;
    purpose?: string;
}

export interface IntelligencePublicRecord {
    id: string;
    bureau: Bureau;
    type: 'BANKRUPTCY' | 'JUDGMENT' | 'LIEN';
    dateFiled: NormalizedField<string>;
    referenceNumber: NormalizedField<string>;
    court: NormalizedField<string>;
    status: NormalizedField<string>;
    amount: NormalizedField<number>;
}

export interface DisputeEntry {
    id: string;
    targetEntityId: string; // Tradeline/Collection/Inquiry ID
    type: 'BUREAU_DISPUTE' | 'FURNISHER_DISPUTE' | 'CFPB_COMPLAINT';
    dateInitiated: string;
    dateCompleted?: string;
    status: 'PENDING' | 'RESOLVED_REMOVED' | 'RESOLVED_UPDATED' | 'RESOLVED_VALIDATED' | 'FAILED';
    resolutionNote?: string;
    auditTrailUrl?: string;
}

export interface UserCreditProfile {
    userId: string;
    updatedAt: string;

    // Identity (Aggregated)
    identity: {
        name: string;
        ssn_partial: string;
        dob: string | null;
        addresses: string[];
        employers: string[];
    };

    // Scored State
    scores: {
        experian?: number;
        transunion?: number;
        equifax?: number;
        lastUpdate: string;
    };

    // Canonical Data
    tradelines: IntelligenceTradeline[];
    collections: IntelligenceCollection[];
    inquiries: IntelligenceInquiry[];
    publicRecords: IntelligencePublicRecord[];

    // History & Outcomes
    disputeHistory: DisputeEntry[];
    activeFindings: ForensicFinding[];
    activeViolations: Violation[];
    activeStrategies: EnforcementStrategy[];

    // Overall Metrics
    metrics: {
        totalDebt: number;
        totalLimit: number;
        utilization: number;
        derogatoryCount: number;
        averageAgeMonths: number;
    };
}
