
import { DataGenerator } from './data_generator';
import { ViolationEngine } from '../engine/violation_engine';
import { StrategyEngine } from '../engine/strategy_engine';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';

async function runValidationAudit() {
    console.log("--- Phase 10: Full Cognitive Loop Validation ---");
    const count = 100;
    const batch = DataGenerator.generateBatch(count);

    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let driftGapsExceeding15 = 0;

    const startTime = Date.now();

    const results = batch.map(({ profile, expected }) => {
        const loopStart = performance.now();

        // 1. Violation Detection
        const foundViolations = ViolationEngine.scanProfile(profile);

        // 2. Strategy Generation (Injecting mock history for drift test)
        // Simulate rejections for profiles ending in 2 or 6 to observe drift
        if (profile.userId.endsWith('2') || profile.userId.endsWith('6')) {
            StrategyEngine.recordOutcome('CONTRA-001', 'METRO2-BAL-PAST-DUE', 'DISPUTE', 'LEGAL_REJECTION');
            StrategyEngine.recordOutcome('CONTRA-001', 'METRO2-BAL-PAST-DUE', 'DISPUTE', 'LEGAL_REJECTION');
        }

        const strategies = StrategyEngine.generateStrategies(profile);
        const loopEnd = performance.now();

        const foundRuleIds = foundViolations.map(v => v.rule_id);
        const expectedRuleIds = expected.expectedViolations;

        // Calculate Metrics
        expectedRuleIds.forEach(ruleId => {
            if (foundRuleIds.includes(ruleId)) truePositives++;
            else falseNegatives++;
        });
        foundRuleIds.forEach(ruleId => {
            if (!expectedRuleIds.includes(ruleId)) falsePositives++;
        });

        // Drift Audit
        strategies.forEach(s => {
            const driftValue = s.declarativeMetadata?.driftApplied || 0;
            // Highlight gaps > 15% (30%, 45%, etc.)
            if (Math.abs(driftValue) > 15) driftGapsExceeding15++;
        });

        return {
            userId: profile.userId,
            violations: foundRuleIds.length,
            strategies: strategies.length,
            latencyMs: loopEnd - loopStart
        };
    });

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgLatency = results.reduce((acc, r) => acc + r.latencyMs, 0) / count;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;

    const report = {
        timestamp: new Date().toISOString(),
        profiles: count,
        performance: {
            totalProcessingTimeMs: totalTime,
            avgLoopLatencyMs: Math.round(avgLatency * 100) / 100,
            throughput: Math.round(1000 / avgLatency) + " loops/sec"
        },
        accuracy: {
            precision: Math.round(precision * 100),
            recall: Math.round(recall * 100),
            truePositives,
            falsePositives,
            falseNegatives
        },
        driftAudit: {
            strategiesAnalyzed: results.reduce((acc, r) => acc + r.strategies, 0),
            gapsExceeding15Percent: driftGapsExceeding15
        }
    };

    console.log("\n--- Audit Results ---");
    console.log(`Accuracy: ${report.accuracy.precision}% Precision / ${report.accuracy.recall}% Recall`);
    console.log(`Performance: ${report.performance.avgLoopLatencyMs}ms per loop (${report.performance.throughput})`);
    console.log(`Drift Gap Audit: ${driftGapsExceeding15} strategies exceeding 15% threshold.`);

    fs.writeFileSync(path.join(__dirname, 'full_validation_report.json'), JSON.stringify(report, null, 2));
    console.log(`\nDetailed report saved to: ${path.join(__dirname, 'full_validation_report.json')}`);
}

runValidationAudit().catch(console.error);
