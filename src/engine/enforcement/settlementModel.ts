/**
 * Represents the structured deterministic output for Settlement Targets.
 */
export interface SettlementTargetResult {
    targetSettlement: number;
    statutoryMax: number;
    documentedActualDamage: number;
    precedentWeightedAvg: number;
    xaiReasoningTrace: string; // Cryptographic trace of how this was formulated
}

interface SettlementTargetInputs {
    violationCount: number;
    isWillful: boolean; // FCRA allows punitive damages for willful noncompliance
    documentedActualDamage: number; // e.g., lost job due to background check, denied mortgage yield spread
    precedentWeightedAverageSettlement: number; // Historic settlement average for similar cases against this creditor
}

/**
 * Calculates the target settlement floor for negotiations.
 * 
 * Formula:
 * Target Settlement = Max(statutory_max, documented_actual_damage, precedent_weighted_average_settlement)
 */
export function calculateSettlementTarget(inputs: SettlementTargetInputs): SettlementTargetResult {
    // 1. Calculate Statutory Max
    // Standard FCRA § 616/617 is $1k per violation, but if willful it can be actual damages + punitive
    // For this model, statutory max is base $1k * violations. If willful, we multiply by a punitive factor (e.g. 3x)
    const baseStatutory = inputs.violationCount * 1000;
    const statutoryMax = inputs.isWillful ? baseStatutory * 3 : baseStatutory;

    // 2. Evaluate Exact Mathematical Formula
    const targetSettlement = Math.max(
        statutoryMax,
        inputs.documentedActualDamage,
        inputs.precedentWeightedAverageSettlement
    );

    // 3. Generate XAI Trace
    const governingFactor = targetSettlement === statutoryMax ? 'Statutory Maximums' :
        targetSettlement === inputs.documentedActualDamage ? 'Documented Actual Damages' :
            'Precedent Average Settlements';

    const xaiReasoningTrace = `[SETTLEMENT TARGET: $${targetSettlement.toFixed(2)}] Derived using the ${governingFactor} which represented the absolute maximum. `
        + `Inputs -> Statutory Max: $${statutoryMax}, Actual Damage: $${inputs.documentedActualDamage}, `
        + `Precedent Average: $${inputs.precedentWeightedAverageSettlement}. Willful flag was ${inputs.isWillful}.`;

    return {
        targetSettlement,
        statutoryMax,
        documentedActualDamage: inputs.documentedActualDamage,
        precedentWeightedAvg: inputs.precedentWeightedAverageSettlement,
        xaiReasoningTrace
    };
}
