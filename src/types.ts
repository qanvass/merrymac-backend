export interface Tradeline {
    id: string;
    creditor: string;
    accountNumber: string;
    status: 'OPEN' | 'CLOSED' | 'COLLECTION' | 'CHARGE_OFF' | 'LATE' | 'REPO' | 'OK';
    balance: number;
    limit: number;
    openedDate: string;
    paymentHistory: string[];
    agencies: {
        experian: boolean;
        transunion: boolean;
        equifax: boolean;
    };
    notes?: string;
}

export interface Inquiry {
    id: string;
    creditor: string;
    date: string;
    bureau: 'Experian' | 'TransUnion' | 'Equifax';
}

export interface CreditReport {
    id: string;
    uploadDate: string;
    fileName: string;
    rawPages: string[];
    personalInfo: {
        name: string;
        dob: string;
        ssn: string;
        addresses: {
            street: string;
            dateReported: string;
        }[];
        employers: string[];
    };
    scores: {
        experian: number;
        transunion: number;
        equifax: number;
    };
    tradelines: Tradeline[];
    collections: {
        id: string;
        creditor: string;
        originalCreditor: string;
        amount: number;
        dateOpened: string;
        status: 'UNPAID' | 'PAID' | 'SETTLED';
    }[];
    inquiries: Inquiry[];
    publicRecords: {
        id: string;
        type: 'BANKRUPTCY' | 'JUDGMENT' | 'LIEN';
        dateFiled: string;
        referenceNumber: string;
        court: string;
        status: string;
        amount: number;
    }[];
    summary: {
        totalDebt: number;
        utilization: number;
        derogatoryCount: number;
        averageAgeYears: number;
        oldestAccountYears: number;
    };
}

export interface Violation {
    id: string;
    type: string;
    description: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    timestamp: string;
    status: 'PENDING' | 'RESOLVED' | 'DISPUTED';
    relatedTradelineId?: string;
    legalBasis?: string;
    recommendedAction?: string;
}

export interface ForensicViolation extends Violation {
    legalBasis: string;
    recommendedAction: string;
    removalProbabilityWeight?: number;
}

export interface AnalysisResult {
    consensusReached: boolean;
    violations: ForensicViolation[];
    confidence: number;
    reasoning: string;
    estimatedRecovery: number;
    dualLLM?: any;
}

export interface SimulationResult {
    currentEstimate: number;
    projectedScore: number;
    potentialGain: number;
    scenarios: {
        name: string;
        impact: number;
        description: string;
    }[];
}
