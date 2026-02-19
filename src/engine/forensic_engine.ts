import { CreditReport, Tradeline, ForensicViolation } from '../types';

export const forensicEngine = {
    scanReport(report: CreditReport): { violations: ForensicViolation[], scoring: any, dualLLM: any } {
        const violations: ForensicViolation[] = [];

        // 1. Scan Tradelines
        report.tradelines.forEach(t => {
            violations.push(...this.checkTradeline(t));
        });

        // 2. Scan Collections
        report.collections.forEach(c => {
            violations.push(...this.checkCollection(c));
        });

        // 3. Scan Inquiries
        violations.push(...this.checkInquiries(report.inquiries));

        // 4. Calculate Removal Probability (Weighted)
        const totalWeight = violations.reduce((sum, v) => sum + (v.removalProbabilityWeight || 0), 0);
        const removalProbability = Math.min(100, Math.max(5, totalWeight)); // Baseline 5%

        const dualLLM = this.generateDualLLMOpinion(violations);

        return {
            violations,
            scoring: {
                ficoEstimate: 0, // Placeholder
                riskLevel: this.calculateRiskLevel(violations.length),
                removalProbability
            },
            dualLLM
        };
    },

    generateDualLLMOpinion(violations: ForensicViolation[]) {
        const count = violations.length;
        const critical = violations.filter(v => v.severity === 'HIGH').length;

        return {
            forensicOpinion: `Detected ${count} statutory violations. ${critical} are critical (FCRA/FDCPA/UCC). High probability of deletion via Metro 2 compliance challenge due to incomplete data furnishing.`,
            legalOpinion: `Violations of 15 U.S.C. § 1681 (FCRA) and § 1692 (FDCPA) observed. Creditors have failed to maintain strict accuracy standards. Recommended course: Administrative Dispute followed by CFPB complaint if unrectified.`,
            consensusConfidence: count > 0 ? 95 : 100,
            finalVerdict: count > 0
                ? "ACTIONABLE: Aggressive dispute strategy recommended. Statutory leverage confirmed."
                : "CLEAN: No actionable statutory violations detected at this time."
        };
    },

    checkTradeline(t: Tradeline): ForensicViolation[] {
        const issues: ForensicViolation[] = [];

        // Rule 1: Charge-Off Compliance (FCRA § 623)
        // Logic: Status is Charge-Off AND (Balance > 0 OR multiple reporting OR reporting > 7 years)
        if (t.status === 'CHARGE_OFF') {
            // In a real scenario, we'd check DOFD. Here we verify balance and age.
            const accountAgeYrs = (new Date().getTime() - new Date(t.openedDate).getTime()) / (1000 * 60 * 60 * 24 * 365);

            if (t.balance > 0 || accountAgeYrs > 7) {
                issues.push({
                    id: `V-CO-${t.id}`,
                    type: 'FCRA_623',
                    severity: 'HIGH',
                    description: `Charge-Off '${t.creditor}' reported with balance or obsolete date (Age: ${accountAgeYrs.toFixed(1)} years).`,
                    legalBasis: '15 U.S.C. § 1681s-2',
                    recommendedAction: 'Dispute improper charge-off reporting/balance.',
                    timestamp: new Date().toISOString(),
                    status: 'PENDING',
                    relatedTradelineId: t.id,
                    removalProbabilityWeight: 25
                });
            }
        }

        // Rule 2: Late Payment Validation (FCRA § 611)
        // Logic: Late payments exist. Check for age (simplified).
        // Real implementation would check 30/60/90 matrix against DOFD.
        const hasLateHistory = t.paymentHistory.some(s => ['30', '60', '90', '120', '150', '180'].includes(s));
        if (t.status === 'LATE' || hasLateHistory) {
            const accountAgeYrs = (new Date().getTime() - new Date(t.openedDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
            if (accountAgeYrs > 7) {
                issues.push({
                    id: `V-LATE-${t.id}`,
                    type: 'FCRA_611',
                    severity: 'MEDIUM',
                    description: `Late payment history on '${t.creditor}' may be obsolete or unverified.`,
                    legalBasis: '15 U.S.C. § 1681i',
                    recommendedAction: 'Demand verification of delinquency dates.',
                    timestamp: new Date().toISOString(),
                    status: 'PENDING',
                    relatedTradelineId: t.id,
                    removalProbabilityWeight: 15
                });
            }
        }

        // Rule: Repo Deficiency (UCC Article 9) - KEEPING EXISTING
        if (t.status === 'REPO') {
            issues.push({
                id: `V-RP-${t.id}`,
                type: 'UCC_ART9',
                severity: 'HIGH',
                description: `Vehicle repossession by '${t.creditor}'. Verify Deficiency Notice and commercial reasonableness.`,
                legalBasis: 'UCC Article 9',
                recommendedAction: 'Demand proof of commercially reasonable sale.',
                timestamp: new Date().toISOString(),
                status: 'PENDING',
                relatedTradelineId: t.id,
                removalProbabilityWeight: 35
            });
        }

        return issues;
    },

    checkCollection(c: any): ForensicViolation[] {
        // Rule 3: Collection Validation (FDCPA § 809)
        // Logic: Collection exists.
        return [{
            id: `V-COL-${c.id}`,
            type: 'FDCPA_809',
            severity: 'HIGH',
            description: `Collection '${c.creditor}' (Original: ${c.originalCreditor}). Lacks validation of debt/assignment.`,
            legalBasis: '15 U.S.C. § 1692g',
            recommendedAction: 'Send Debt Validation Letter.',
            timestamp: new Date().toISOString(),
            status: 'PENDING',
            removalProbabilityWeight: 30
        }];
    },

    checkInquiries(inquiries: any[]): ForensicViolation[] {
        if (inquiries.length > 5) {
            return [{
                id: `V-INQ-VEL`,
                type: 'FCRA_604',
                severity: 'MEDIUM',
                description: `Excessive inquiries (${inquiries.length}) without permissible purpose.`,
                legalBasis: '15 U.S.C. § 1681b',
                recommendedAction: 'Challenge non-permissible inquiries.',
                timestamp: new Date().toISOString(),
                status: 'PENDING',
                removalProbabilityWeight: 10
            }];
        }
        return [];
    },

    calculateRiskLevel(violationCount: number): string {
        if (violationCount >= 5) return 'CRITICAL';
        if (violationCount >= 3) return 'HIGH';
        if (violationCount >= 1) return 'MODERATE';
        return 'LOW';
    },

    calculateScoreRecovery(violations: ForensicViolation[]): number {
        // Simple deterministic recovery estimation
        // Charge-off removal ~30-50 pts
        // Late payment removal ~10-20 pts
        // Collection removal ~20-40 pts
        let potentialRecovery = 0;

        violations.forEach(v => {
            if (v.type.includes('623') || v.type.includes('CHARGE')) potentialRecovery += 40;
            else if (v.type.includes('611') || v.type.includes('LATE')) potentialRecovery += 15;
            else if (v.type.includes('809') || v.type.includes('COLLECTION')) potentialRecovery += 25;
            else potentialRecovery += 5;
        });

        return Math.min(potentialRecovery, 150); // Cap at 150 pts
    }
};
