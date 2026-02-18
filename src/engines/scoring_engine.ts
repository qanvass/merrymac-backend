import { CreditReport, SimulationResult } from '../types';

export const scoringEngine = {
    simulate(report: CreditReport): SimulationResult {
        // FICO-like Algorithmic Simulation (Deterministic)
        let baseline = report.scores.equifax || 620;
        const scenarios: SimulationResult['scenarios'] = [];

        // 1. Payment History (35%) - Removal of Negatives
        const collections = report.collections.length;
        const derogatory = report.tradelines.filter(t => ['COLLECTION', 'CHARGE_OFF', 'LATE', 'REPO'].includes(t.status)).length;

        if (collections > 0 || derogatory > 0) {
            // Algorithm: Approx 40-80 points for clean-up depending on severity
            const collectionImpact = collections * 15;
            const derogatoryImpact = derogatory * 10;
            const totalGain = Math.min(100, collectionImpact + derogatoryImpact); // Cap at 100 for safety

            scenarios.push({
                name: "Clean Slate Protocol (History)",
                impact: totalGain,
                description: `Removing ${collections} collections and ${derogatory} derogatory marks is projected to recover approx ${totalGain} points (Max 35% weight impact).`
            });
        }

        // 2. Utilization (30%)
        const totalLimit = report.tradelines.reduce((sum, t) => sum + t.limit, 0);
        const totalBalance = report.tradelines.reduce((sum, t) => sum + t.balance, 0);
        const currentUtil = totalLimit > 0 ? (totalBalance / totalLimit) : 0;

        if (currentUtil > 0.09) {
            // Algorithm: Moving from >X% to <9%
            let utilGain = 0;
            if (currentUtil > 0.9) utilGain = 65;
            else if (currentUtil > 0.5) utilGain = 45;
            else if (currentUtil > 0.3) utilGain = 25;
            else utilGain = 15;

            scenarios.push({
                name: "Utilization Optimization (<9%)",
                impact: utilGain,
                description: `Reducing utilization to optimal <9% threshold from ${(currentUtil * 100).toFixed(0)}% yields high impact.`
            });
        }

        // 3. Length of History (15%) - Inquiry Aging
        // Algorithm: Hard inquiries fall off impact after 12m. 
        const recentInquiries = report.inquiries.length; // Assuming these are all < 2 years
        if (recentInquiries > 2) {
            const inqPoints = (recentInquiries - 2) * 5; // approx 5 pts per excessive inquiry
            scenarios.push({
                name: "Inquiry Permissible Purpose Clean-up",
                impact: inqPoints,
                description: `Disputing ${recentInquiries - 2} non-permissible hard inquiries.`
            });
        }

        const totalPotential = scenarios.reduce((sum, s) => sum + s.impact, 0);
        return {
            currentEstimate: baseline,
            projectedScore: Math.min(850, baseline + totalPotential),
            potentialGain: totalPotential,
            scenarios
        };
    }
};
