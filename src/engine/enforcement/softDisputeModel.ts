/**
 * Standard output format for the Soft Dispute EV model.
 */
export interface SoftDisputeResult {
    softDisputeEV: number;
    isViable: boolean; // Should we pursue this soft dispute?
    xaiReasoningTrace: string;
}

interface SoftDisputeInputs {
    removalProbabilitySoft: number; // Monte Carlo probability of soft dispute succeeding (0.0 - 1.0)
    scoreGainValue: number; // The projected monetary/opportunity value of the score bump (e.g., $ savings on mortgage)
    timeCostBasis: number; // Hours invested * hourly rate
    opportunityCost: number; // Value of pursuing a hard dispute/litigation instead with those same resources
}

/**
 * Probabilistic removal strategy model evaluating the EV of 'soft disputes' (e.g., CFPB portal only, not certified mail/litigation).
 * 
 * Formula:
 * Soft Dispute EV = (removal_probability_soft * score_gain_value) - (time_cost * opportunity_cost)
 */
export function calculateSoftDisputeEV(inputs: SoftDisputeInputs): SoftDisputeResult {
    // 1. Calculate the gross probability-adjusted value
    const probabilisticValue = inputs.removalProbabilitySoft * inputs.scoreGainValue;

    // 2. Calculate the resource drain
    const totalResourceDrain = inputs.timeCostBasis + inputs.opportunityCost; // Adjusted formula slightly to addition based on standard risk modeling, but conceptually it matches the drain factor

    // Note: If the founder specifically meant multiplication for drain in their prompt: (time_cost * opportunity_cost)
    // we will strictly adhere to that formula logic string, though mathematically (time + opportunity) is standard.
    // Given the prompt: Soft Dispute EV = (removal_probability_soft * score_gain_value) - (time_cost * opportunity_cost)
    const exactPromptResourceDrain = inputs.timeCostBasis * inputs.opportunityCost;

    // 3. Expected Value
    const softDisputeEV = probabilisticValue - exactPromptResourceDrain;

    // 4. Viability Threshold
    // We only pursue if EV is strictly positive and > some baseline processing threshold
    const isViable = softDisputeEV > 0;

    // 5. XAI Trace
    const xaiReasoningTrace = `[SOFT DISPUTE EV: $${softDisputeEV.toFixed(2)}] `
        + `Calculated by predicting a ${(inputs.removalProbabilitySoft * 100).toFixed(1)}% chance `
        + `of unlocking $${inputs.scoreGainValue.toFixed(2)} in score-jump value. `
        + `Subtracted execution drain of $${exactPromptResourceDrain.toFixed(2)}. `
        + `Strategy declared ${isViable ? 'VIABLE' : 'NON-VIABLE'} for soft execution.`;

    return {
        softDisputeEV,
        isViable,
        xaiReasoningTrace
    };
}
