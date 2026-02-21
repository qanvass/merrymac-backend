
import { v4 as uuidv4 } from 'uuid';
import { UserCreditProfile, IntelligenceTradeline, NormalizedField, Bureau } from '../types/intelligence_types';

const field = <T>(value: T, confidence: number = 90, source: string = 'synthetic-gen'): NormalizedField<T> => ({
    value,
    originalValue: String(value),
    confidence,
    source
});

export interface ExpectedOutcome {
    profileId: string;
    expectedViolations: string[]; // rule_ids
}

export class DataGenerator {
    static generateProfile(type: 'thin' | 'thick' | 'contradictory' | 'clean', idSuffix: string): { profile: UserCreditProfile, expected: ExpectedOutcome } {
        const id = `user-${idSuffix}`;
        const profile: UserCreditProfile = {
            userId: id,
            updatedAt: new Date().toISOString(),
            identity: {
                name: "John Doe",
                ssn_partial: "1234",
                dob: "1980-01-01",
                addresses: ["123 Maple St"],
                employers: ["Generic Corp"]
            },
            scores: { experian: 650, lastUpdate: new Date().toISOString() },
            tradelines: [],
            collections: [],
            inquiries: [],
            publicRecords: [],
            disputeHistory: [],
            activeFindings: [],
            activeViolations: [],
            activeStrategies: [],
            dtiProfile: {
                grossAnnualIncome: null,
                monthlyHousingPayment: null,
                otherMonthlyObligations: null,
                calculatedDTI: null
            },
            metrics: {
                totalDebt: 0,
                totalLimit: 0,
                utilization: 0,
                derogatoryCount: 0,
                averageAgeMonths: 24
            }
        };

        const expected: ExpectedOutcome = { profileId: id, expectedViolations: [] };

        if (type === 'thin') {
            profile.tradelines.push(this.createTradeline('CREDIT-001', 'EXPERIAN', 'Chase', 500, 2000));
        } else if (type === 'thick') {
            for (let i = 0; i < 15; i++) {
                profile.tradelines.push(this.createTradeline(`CREDIT-00${i}`, i % 3 === 0 ? 'EXPERIAN' : i % 3 === 1 ? 'TRANSUNION' : 'EQUIFAX', 'Lender ' + i, 1000, 5000));
            }
        } else if (type === 'contradictory') {
            // Contradiction 1: Balance vs Past Due
            const tl1 = this.createTradeline('CONTRA-001', 'EQUIFAX', 'Target', 0, 1000);
            tl1.pastDueAmount = field(500);
            profile.tradelines.push(tl1);
            expected.expectedViolations.push('METRO2-BAL-PAST-DUE');

            // Contradiction 2: Closed account derogatory
            const tl2 = this.createTradeline('CONTRA-002', 'EXPERIAN', 'Citi', 1000, 5000);
            tl2.dateClosed = field('2023-01-01');
            tl2.statusCode = field('71'); // Charge-off
            profile.tradelines.push(tl2);
            expected.expectedViolations.push('METRO2-CLOSED-DEROG');

            // Contradiction 3: Charge-off but OK status
            const tl3 = this.createTradeline('CONTRA-003', 'TRANSUNION', 'Amex', 2000, 10000);
            tl3.statusCode = field('97'); // Charge-off
            tl3.status = field('Current');
            profile.tradelines.push(tl3);
            expected.expectedViolations.push('METRO2-CO-INCONSISTENT');

            // Contradiction 4: Missing Open Date
            const tl4 = this.createTradeline('CONTRA-004', 'EXPERIAN', 'Apple', 0, 0);
            tl4.dateOpened = field(null);
            profile.tradelines.push(tl4);
            expected.expectedViolations.push('FORMAT-MISSING-OPEN-DATE');
        }

        return { profile, expected };
    }

    private static createTradeline(id: string, bureau: Bureau, creditor: string, balance: number, limit: number): IntelligenceTradeline {
        return {
            id,
            bureau,
            creditor: field(creditor),
            accountNumber: field(`XXXX-${id}`),
            accountType: field('Revolving'),
            dateOpened: field('2020-01-01'),
            dateLastActive: field(new Date().toISOString()),
            dateClosed: field(null),
            balance: field(balance),
            creditLimit: field(limit),
            pastDueAmount: field(0),
            status: field('Pays as Agreed'),
            statusCode: field('11'),
            paymentHistory: ["OK", "OK", "OK"],
            isDisputed: false,
            remarks: [],
            violations: []
        };
    }

    static generateBatch(count: number): { profile: UserCreditProfile, expected: ExpectedOutcome }[] {
        const batch: { profile: UserCreditProfile, expected: ExpectedOutcome }[] = [];
        const types: ('thin' | 'thick' | 'contradictory' | 'clean')[] = ['thin', 'thick', 'contradictory', 'clean'];

        for (let i = 0; i < count; i++) {
            const type = types[i % types.length];
            batch.push(this.generateProfile(type, String(i)));
        }
        return batch;
    }
}
