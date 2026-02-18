import { CreditReport, Tradeline, ForensicViolation } from '../types';
import { getViolationContext } from '../utils/forensicLogic';

export const forensicEngine = {
    async scanReport(report: CreditReport): Promise<ForensicViolation[]> {
        const violations: ForensicViolation[] = [];

        // 1. Scan Tradelines
        report.tradelines.forEach(t => {
            const tViolations = this.checkTradeline(t);
            violations.push(...tViolations);
        });

        // 2. Scan for Duplicates (Cross-Tradeline check)
        violations.push(...this.checkDuplicateReporting(report.tradelines));

        // 3. Scan Inquiries
        const inqViolations = this.checkInquiries(report.inquiries);
        violations.push(...inqViolations);

        // 4. Scan Collections
        report.collections.forEach(c => {
            const cViolations = this.checkCollection(c);
            violations.push(...cViolations);
        });

        return violations;
    },

    checkTradeline(t: Tradeline): ForensicViolation[] {
        const issues: ForensicViolation[] = [];

        // Rule: Charge-Off with Balance (FCRA § 623(a)(2))
        if (t.status === 'CHARGE_OFF' && t.balance > 0) {
            const context = getViolationContext(t.status, t.balance);
            issues.push({
                id: `V-TO-${t.id}`,
                type: 'Reporting Inaccuracy (Double Dipping)',
                severity: 'HIGH',
                description: `Account '${t.creditor}' is reported as a Charge-Off but still shows a balance of $${t.balance}.`,
                legalBasis: context.law,
                recommendedAction: 'Dispute balance reporting for charged-off account.',
                timestamp: new Date().toISOString(),
                status: 'PENDING',
                relatedTradelineId: t.id
            });
        }

        // Rule: Illegal Re-aging / DOFD Inconsistency (FCRA § 605)
        const accountAgeYrs = (new Date().getTime() - new Date(t.openedDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (t.status === 'COLLECTION' && accountAgeYrs > 7) {
            issues.push({
                id: `V-RA-${t.id}`,
                type: 'Illegal Re-aging',
                severity: 'HIGH',
                description: `Collection account '${t.creditor}' appears to be past the 7-year reporting limit (Opened: ${t.openedDate}).`,
                legalBasis: 'FCRA § 605(c)',
                recommendedAction: 'Full removal demand due to obsolete reporting.',
                timestamp: new Date().toISOString(),
                status: 'PENDING',
                relatedTradelineId: t.id
            });
        }

        // Rule: Repo Deficiency (UCC Article 9)
        if (t.status === 'REPO') {
            const context = getViolationContext(t.status, t.balance);
            issues.push({
                id: `V-RP-${t.id}`,
                type: 'UCC Compliance Failure',
                severity: 'HIGH',
                description: `Vehicle repossession by '${t.creditor}' reported. Requires verification of Deficiency Notice compliance.`,
                legalBasis: context.law,
                recommendedAction: 'Demand proof of commercially reasonable sale and notification.',
                timestamp: new Date().toISOString(),
                status: 'PENDING',
                relatedTradelineId: t.id
            });
        }

        return issues;
    },

    checkDuplicateReporting(tradelines: Tradeline[]): ForensicViolation[] {
        const duplicates: ForensicViolation[] = [];
        const seen = new Map<string, string>();

        tradelines.forEach(t => {
            const key = `${t.creditor.toUpperCase()}_${t.accountNumber.slice(-4)}`;
            if (seen.has(key)) {
                duplicates.push({
                    id: `V-DUP-${t.id}`,
                    type: 'Duplicate Reporting Violation',
                    severity: 'MEDIUM',
                    description: `Account '${t.creditor}' is reported multiple times with similar account signatures.`,
                    legalBasis: 'FCRA § 623(a)(1)',
                    recommendedAction: 'Merge or delete duplicate reporting entries.',
                    timestamp: new Date().toISOString(),
                    status: 'PENDING',
                    relatedTradelineId: t.id
                });
            } else {
                seen.set(key, t.id);
            }
        });

        return duplicates;
    },

    checkInquiries(inquiries: any[]): ForensicViolation[] {
        if (inquiries.length > 5) {
            return [{
                id: `V-INQ-99`,
                type: 'Inquiry Velocity Violation',
                severity: 'MEDIUM',
                description: `${inquiries.length} hard inquiries detected. This exceeds standard permissible purpose thresholds for non-shopping windows.`,
                legalBasis: 'FCRA § 604',
                recommendedAction: 'Dispute all inquiries not resulting in an active tradeline.',
                timestamp: new Date().toISOString(),
                status: 'PENDING'
            }];
        }
        return [];
    },

    checkCollection(c: any): ForensicViolation[] {
        const context = getViolationContext('COLLECTION', c.amount);
        return [{
            id: `V-COL-${c.id}`,
            type: 'Chain of Title Deficiency',
            severity: 'HIGH',
            description: `Collection account by '${c.creditor}' (Original: ${c.originalCreditor}). Lacks documented assignment of rights.`,
            legalBasis: context.law,
            recommendedAction: 'Draft Debt Validation and Chain of Title verification request.',
            timestamp: new Date().toISOString(),
            status: 'PENDING'
        }];
    },

    calculateScoreRecovery(violations: ForensicViolation[]): number {
        const highImpact = violations.filter(v => v.severity === 'HIGH').length;
        const medImpact = violations.filter(v => v.severity === 'MEDIUM').length;
        return (highImpact * 25) + (medImpact * 10);
    }
};
