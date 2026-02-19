
import { UserCreditProfile, IntelligenceTradeline, Violation } from '../types/intelligence_types';
import { v4 as uuidv4 } from 'uuid';
import { differenceInDays, parseISO } from 'date-fns';

export class ViolationEngine {
    /**
     * Scans a UserCreditProfile for deterministic violations.
     */
    public static scanProfile(profile: UserCreditProfile, targetEntityIds?: string[]): Violation[] {
        const violations: Violation[] = [];

        // Scan Tradelines
        for (const tl of profile.tradelines) {
            // Targeted Re-scan: skip if not in target list
            if (targetEntityIds && !targetEntityIds.includes(tl.id)) {
                // Keep existing violations for this tradeline
                if (tl.violations) violations.push(...tl.violations);
                continue;
            }

            const tlViolations = this.scanTradeline(tl);
            tl.violations = tlViolations;
            violations.push(...tlViolations);
        }

        // Add to profile global state
        profile.activeViolations = violations;
        return violations;
    }

    /**
     * Deterministic Metro 2 Contradiction Logic for a single Tradeline.
     */
    private static scanTradeline(tl: IntelligenceTradeline): Violation[] {
        const violations: Violation[] = [];

        // STALENESS GUARD: If reporting is too old, penalize all violations
        const reportedDate = tl.balance.source.startsWith('file-') ? tl.dateOpened.value : new Date().toISOString(); // Placeholder for reporting date
        const daysSinceReported = reportedDate ? differenceInDays(new Date(), parseISO(reportedDate)) : 0;
        const stalenessPenalty = daysSinceReported > 120 ? -30 : daysSinceReported > 90 ? -15 : 0;

        // 1. Balance vs Past Due contradiction
        if (tl.balance.value === 0 && tl.pastDueAmount.value > 0) {
            const confidence = Math.max(0, Math.round((tl.balance.confidence + tl.pastDueAmount.confidence) / 2) + stalenessPenalty);
            violations.push(this.createViolation(
                'METRO2-BAL-PAST-DUE',
                'HIGH',
                `Tradeline reports $0 balance but has a past due amount of $${tl.pastDueAmount.value}.`,
                'FCRA § 623(a)',
                'Delete past due amount or correct balance.',
                tl.id,
                confidence
            ));
        }

        // 2. Closed Account Reporting Activity
        if (tl.dateClosed.value && tl.statusCode.value !== '11') {
            if (tl.statusCode.value === '71' || tl.statusCode.value === '78' || tl.statusCode.value === '80') {
                const confidence = Math.max(0, Math.round((tl.dateClosed.confidence + tl.statusCode.confidence) / 2) + stalenessPenalty);
                violations.push(this.createViolation(
                    'METRO2-CLOSED-DEROG',
                    'MEDIUM',
                    'Account reports derogatory status on a closed account.',
                    'FCRA § 623',
                    'Update status to reflect accurate terminal state.',
                    tl.id,
                    confidence
                ));
            }
        }

        // 3. Charge-Off Status Inconsistency
        if (tl.statusCode.value === '97' && (tl.status.value.toLowerCase().includes('current') || tl.status.value.toLowerCase() === 'ok')) {
            const confidence = Math.max(0, Math.round((tl.statusCode.confidence + tl.status.confidence) / 2) + stalenessPenalty);
            violations.push(this.createViolation(
                'METRO2-CO-INCONSISTENT',
                'HIGH',
                'Account reported as Charge-Off but reflects a "Current" or "OK" status.',
                'FCRA § 623(a)',
                'Correct status to reflect actual account state.',
                tl.id,
                confidence
            ));
        }

        // 4. Incomplete Reporting
        if (!tl.dateOpened.value) {
            const confidence = Math.max(0, 50 + stalenessPenalty); // Lower base for missing data
            violations.push(this.createViolation(
                'FORMAT-MISSING-OPEN-DATE',
                'LOW',
                'Tradeline is missing an Open Date.',
                'Metro 2 Standard',
                'Provide accurate date opened.',
                tl.id,
                confidence
            ));
        }

        return violations;
    }

    private static createViolation(
        rule_id: string,
        severity: Violation['severity'],
        description: string,
        statute: string,
        remedy: string,
        entityId: string,
        confidence: number = 100
    ): Violation {
        return {
            id: uuidv4(),
            rule_id,
            severity,
            description,
            statute,
            remedy,
            confidence: Math.min(100, Math.max(0, confidence)),
            relatedEntityId: entityId
        };
    }
}
