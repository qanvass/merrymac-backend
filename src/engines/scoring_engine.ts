import { CreditReport, SimulationResult } from '../types';

export const scoringEngine = {
    simulate(report: CreditReport): SimulationResult {
        // Mock baseline estimation (in real app, this would use a FICO model approximation)
        const baseline = report.scores.equifax || 620;
        let potentialGain = 0;
        const scenarios: SimulationResult['scenarios'] = [];

        // 1. Simulate Removal of Negative Items
        const collectionCount = report.collections.length;
        if (collectionCount > 0) {
            const gain = collectionCount * 15;
            potentialGain += gain;
            scenarios.push({
                name: "Removal of Collections",
                impact: gain,
                description: `Removing ${collectionCount} collection accounts could boost your score by approx ${gain} points.`
            });
        }

        // 2. Simulate Utilization Reduction
        const totalLimit = report.tradelines.reduce((sum, t) => sum + t.limit, 0);
        const totalBalance = report.tradelines.reduce((sum, t) => sum + t.balance, 0);
        const currentUtil = totalLimit > 0 ? (totalBalance / totalLimit) : 0;

        if (currentUtil > 0.3) {
            const reductionGain = 25;
            potentialGain += reductionGain;
            scenarios.push({
                name: "Utilization to 10%",
                impact: reductionGain,
                description: `Reducing utilization from ${Math.round(currentUtil * 100)}% to 10% is projected to add ${reductionGain} points.`
            });
        }

        // 3. Simulate Inquiry Aging
        const recentInquiries = report.inquiries.length;
        if (recentInquiries > 2) {
            const agingGain = 10;
            potentialGain += agingGain;
            scenarios.push({
                name: "Inquiry Aging (>6 months)",
                impact: agingGain,
                description: "As your recent hard inquiries age past 6 months, you may recover approx 10 points."
            });
        }

        return {
            currentEstimate: baseline,
            projectedScore: baseline + potentialGain,
            potentialGain,
            scenarios
        };
    }
};
