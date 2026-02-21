import { ForensicViolation } from '../../types';

export interface EnforcementROIResult {
    expectedValue: number;
    strategicActionTier: 'DISPUTE' | 'CFPB_COMPLAINT' | 'LITIGATION_THREAT' | 'FILE_SUIT';
    escalationThresholdTriggered: boolean;
    xaiReasoningTrace: string; // Explains the math
}

interface EnforcementROIInputs {
    violations: ForensicViolation[];
    removalProbability: number; // 0.0 to 1.0 from monte_carlo_output
    precedentStrengthScore: number; // 0.0 to 1.0
    creditorLossRatio: number; // 0.0 to 1.0
    litigationCostEstimate: number; // e.g. 400 filing fee + hours
    litigationProbability: number; // 0.0 to 1.0
}

/**
 * Calculates the Expected ROI of enforcing a set of FCRA/FDCPA violations.
 * 
 * Formula:
 * Expected Recovery = (statutory_damages_estimate * removal_probability * precedent_strength) 
 *                   - (litigation_cost_estimate * litigation_probability)
 */
export function calculateEnforcementROI(inputs: EnforcementROIInputs): EnforcementROIResult {
    // 1. Calculate Statutory Damages Estimate
    // Typically $1000 per violation for FCRA/FDCPA non-willful, 
    // but could be higher if willful. We'll use $1000 base per violation for the model.
    const statutoryDamagesEstimate = inputs.violations.length * 1000;

    // 2. Compute the Expected Value (EV)
    // Applying the exact mathematical formula prescribed by the brain specification
    const grossRecoveryEV = statutoryDamagesEstimate * inputs.removalProbability * inputs.precedentStrengthScore;
    const litigationRiskCost = inputs.litigationCostEstimate * inputs.litigationProbability;

    // Adjust by creditor loss ratio (if they lose often, our EV goes up slightly as they settle easier)
    // We add a settlement premium based on their proven loss ratio.
    const settlementPremium = (statutoryDamagesEstimate * 0.5) * inputs.creditorLossRatio;

    const expectedValue = Math.max(0, grossRecoveryEV + settlementPremium - litigationRiskCost);

    // 3. Determine Strategic Action Tier
    let strategicActionTier: EnforcementROIResult['strategicActionTier'] = 'DISPUTE';
    let escalationThresholdTriggered = false;

    if (expectedValue > 5000) {
        strategicActionTier = 'FILE_SUIT';
        escalationThresholdTriggered = true;
    } else if (expectedValue > 2500) {
        strategicActionTier = 'LITIGATION_THREAT';
        escalationThresholdTriggered = true;
    } else if (expectedValue > 1000) {
        strategicActionTier = 'CFPB_COMPLAINT';
        escalationThresholdTriggered = true;
    }

    // 4. Generate XAI Reasoning Trace for the immutable vault log
    const xaiReasoningTrace = `[ENFORCEMENT ROI EV: $${expectedValue.toFixed(2)}] Computed using ${inputs.violations.length} violations (Base damages: $${statutoryDamagesEstimate}). `
        + `Factored Removal Prob: ${(inputs.removalProbability * 100).toFixed(1)}%, Precedent Strength: ${(inputs.precedentStrengthScore * 100).toFixed(1)}%. `
        + `Subtracted Risk Cost: $${litigationRiskCost.toFixed(2)}. `
        + `Tier mapped to [${strategicActionTier}].`;

    return {
        expectedValue,
        strategicActionTier,
        escalationThresholdTriggered,
        xaiReasoningTrace
    };
}
