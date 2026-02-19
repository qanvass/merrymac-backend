
import { UserCreditProfile, Violation, EnforcementStrategy, IntelligenceTradeline } from '../types/intelligence_types';
import { v4 as uuidv4 } from 'uuid';

export class StrategyEngine {
    private static executionHistory: Map<string, { ruleId: string, type: string, outcome: 'SUCCESS' | 'LEGAL_REJECTION' | 'SYSTEM_ERROR', date: string }[]> = new Map();
    private static COOLDOWN_DAYS = 30;
    private static MIN_CONFIDENCE_THRESHOLD = 60;

    /**
     * Records an execution outcome to refine future strategy simulations.
     */
    public static recordOutcome(entityId: string, ruleId: string, type: string, outcome: 'SUCCESS' | 'LEGAL_REJECTION' | 'SYSTEM_ERROR') {
        if (!this.executionHistory.has(entityId)) {
            this.executionHistory.set(entityId, []);
        }
        this.executionHistory.get(entityId)!.push({
            ruleId,
            type,
            outcome,
            date: new Date().toISOString()
        });
        console.log(`[Strategy-Learning] Recorded ${outcome} for ${type} (Rule: ${ruleId}) on ${entityId}`);
    }

    /**
     * Probabilistically decays execution history (Long-Horizon Mitigation).
     * Instead of binary reset, we reduce the 'weight' of past failures by 50%.
     */
    public static decayHistory(entityId: string) {
        const history = this.executionHistory.get(entityId);
        if (history) {
            console.log(`[Strategy-Guard] Penalty Decay triggered for ${entityId}. Reducing failure weight.`);
            // Keep only half of the legal rejections to allow for recovery over time
            const legalFailures = history.filter(h => h.outcome === 'LEGAL_REJECTION');
            const otherRecords = history.filter(h => h.outcome !== 'LEGAL_REJECTION');

            this.executionHistory.set(entityId, [
                ...otherRecords,
                ...legalFailures.slice(0, Math.floor(legalFailures.length / 2))
            ]);
        }
    }

    /**
     * Checks if a granular entity:violation:type is in cooldown.
     */
    private static isInCooldown(entityId: string, ruleId: string, type: string): boolean {
        const history = this.executionHistory.get(entityId);
        if (!history) return false;

        const recent = history.find(h => {
            const daysSince = (new Date().getTime() - new Date(h.date).getTime()) / (1000 * 3600 * 24);
            // Granular Cooldown: Keyed by Entity + Rule + Type
            return h.ruleId === ruleId && h.type === type && h.outcome !== 'SYSTEM_ERROR' && daysSince < this.COOLDOWN_DAYS;
        });

        return !!recent;
    }

    /**
     * Generates enforcement strategies for a profile based on active violations.
     */
    public static generateStrategies(profile: UserCreditProfile): EnforcementStrategy[] {
        const strategies: EnforcementStrategy[] = [];

        // 1. Filter violations by Minimum Confidence Threshold
        const validViolations = profile.activeViolations.filter(v => v.confidence >= this.MIN_CONFIDENCE_THRESHOLD);

        if (validViolations.length < profile.activeViolations.length) {
            console.log(`[Strategy-Guard] Filtered ${profile.activeViolations.length - validViolations.length} low-confidence violations.`);
        }

        // 2. Group violations by target entity
        const entityViolationMap = new Map<string, Violation[]>();
        for (const v of validViolations) {
            if (!entityViolationMap.has(v.relatedEntityId)) {
                entityViolationMap.set(v.relatedEntityId, []);
            }
            entityViolationMap.get(v.relatedEntityId)!.push(v);
        }

        // 3. Generate strategy for each entity with violations
        for (const [entityId, violations] of entityViolationMap.entries()) {
            const tradeline = profile.tradelines.find(t => t.id === entityId);

            // CONFLICT FREEZE: If high-confidence sources contradict, freeze.
            // (Placeholder: Logic to check multi-source conflicts in tradeline fields)
            if (tradeline && tradeline.balance.confidence >= 90 && tradeline.balance.originalValue === 'CONFLICT') {
                console.warn(`[Strategy-Guard] CONFLICT FREEZE for Entity ${entityId}. High-confidence source disagreement.`);
                continue;
            }

            const strategy = this.deriveStrategy(entityId, violations, profile);
            if (strategy) strategies.push(strategy);
        }

        profile.activeStrategies = strategies;
        return strategies;
    }

    private static deriveStrategy(
        entityId: string,
        violations: Violation[],
        profile: UserCreditProfile
    ): EnforcementStrategy | null {
        // Find the most severe violation that isn't in cooldown
        const actionableViolations = violations.filter(v => !this.isInCooldown(entityId, v.rule_id, 'DISPUTE') && !this.isInCooldown(entityId, v.rule_id, 'CFPB_COMPLAINT'));

        if (actionableViolations.length === 0) {
            console.log(`[Strategy-Guard] All violations for Entity ${entityId} are currently in cooldown.`);
            return null;
        }

        const highSeverity = actionableViolations.filter(v => v.severity === 'HIGH');
        const violationIds = actionableViolations.map(v => v.id);

        // LONG-HORIZON MITIGATION: Drift + Recovery Curve
        const history = this.executionHistory.get(entityId) || [];
        const legalFailures = history.filter(h => h.outcome === 'LEGAL_REJECTION');

        // 1. Drift Penalty
        const driftAdjustment = legalFailures.length * -15;

        // 2. Recovery curve: +5% for every 180 days since the last failure
        let recoveryAdjustment = 0;
        if (legalFailures.length > 0) {
            const lastFailureDate = new Date(Math.max(...legalFailures.map(h => new Date(h.date).getTime())));
            const daysSinceLastFailure = (new Date().getTime() - lastFailureDate.getTime()) / (1000 * 3600 * 24);
            recoveryAdjustment = Math.floor(daysSinceLastFailure / 180) * 5;
        }

        const totalAdjustment = Math.min(0, driftAdjustment + recoveryAdjustment);

        // 1. HIGH SEVERITY -> CFPB COMPLAINT
        if (highSeverity.length > 0) {
            return {
                id: uuidv4(),
                type: 'CFPB_COMPLAINT',
                targetEntityId: entityId,
                violationIds,
                removalProbability: Math.max(10, 85 + totalAdjustment),
                litigationRisk: 'HIGH',
                recommendedAction: 'Official CFPB Portal Submission',
                declarativeMetadata: {
                    reason: `Critical accuracy failure detected (${highSeverity[0].rule_id}).`,
                    statute: highSeverity[0].statute,
                    driftApplied: driftAdjustment,
                    recoveryApplied: recoveryAdjustment
                }
            };
        }

        // 2. MULTIPLE ERRORS -> ESCALATION
        if (actionableViolations.length >= 3) {
            return {
                id: uuidv4(),
                type: 'ESCALATION',
                targetEntityId: entityId,
                violationIds,
                removalProbability: Math.max(10, 70 + totalAdjustment),
                litigationRisk: 'MEDIUM',
                recommendedAction: 'Direct Furnisher Escalation',
                declarativeMetadata: {
                    reason: 'Multiple systemic reporting errors suggest process failure.',
                    errorCount: actionableViolations.length,
                    driftApplied: driftAdjustment,
                    recoveryApplied: recoveryAdjustment
                }
            };
        }

        // 3. MED/LOW -> DISPUTE
        return {
            id: uuidv4(),
            type: 'DISPUTE',
            targetEntityId: entityId,
            violationIds,
            removalProbability: Math.max(10, 55 + totalAdjustment),
            litigationRisk: 'LOW',
            recommendedAction: 'Standard Bureau Dispute Letter',
            declarativeMetadata: {
                reason: 'Reporting inconsistency requires verification.',
                driftApplied: driftAdjustment,
                recoveryApplied: recoveryAdjustment
            }
        };
    }
}
