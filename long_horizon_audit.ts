
import { StrategyEngine } from './src/engine/strategy_engine';
import { UserCreditProfile, Violation, EnforcementStrategy } from './src/types/intelligence_types';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

let output = '';
function log(msg: string) {
    console.log(msg);
    output += msg + '\n';
}

/**
 * SCENARIO 1: CONFIDENCE DRIFT & RESET OSCILLATION
 */
async function simulateLongHorizonConfidence() {
    log('\n--- SCENARIO 1: CONFIDENCE DRIFT & RESET OSCILLATION ---');
    const entityId = 'tl-long-horizon-001';

    for (let month = 0; month < 12; month++) {
        StrategyEngine.decayHistory(entityId);
        StrategyEngine.recordOutcome(entityId, 'METRO2-BAL-PAST-DUE', 'DISPUTE_SKILL', 'LEGAL_REJECTION');

        const profile = createMockProfile('user-1', entityId);
        profile.activeViolations = [createMockViolation(entityId)];
        const strategies = StrategyEngine.generateStrategies(profile);
        const prob = strategies[0]?.removalProbability || 0;

        log(`Month ${month + 1}: Removal Probability = ${prob}% (Failures accumulated: ${month + 1})`);
    }
}

/**
 * SCENARIO 2: STRATEGY SELECTION BIAS
 */
async function simulateSelectionBias() {
    log('\n--- SCENARIO 2: STRATEGY SELECTION BIAS ---');
    const difficultCreditor = 'creditor-hard';
    const easyCreditor = 'creditor-easy';

    for (let i = 0; i < 5; i++) {
        StrategyEngine.recordOutcome(difficultCreditor, 'METRO2-BAL-PAST-DUE', 'DISPUTE_SKILL', 'LEGAL_REJECTION');
    }

    const profileHard = createMockProfile('user-2', difficultCreditor);
    profileHard.activeViolations = [createMockViolation(difficultCreditor)];
    const strategyHard = StrategyEngine.generateStrategies(profileHard)[0];

    const profileEasy = createMockProfile('user-3', easyCreditor);
    profileEasy.activeViolations = [createMockViolation(easyCreditor)];
    const strategyEasy = StrategyEngine.generateStrategies(profileEasy)[0];

    log(`Difficult Creditor (${difficultCreditor}) Probability: ${strategyHard?.removalProbability}%`);
    log(`Easy Creditor (${easyCreditor}) Probability: ${strategyEasy?.removalProbability}%`);
}

/**
 * SCENARIO 3: COOLDOWN GRANULARITY
 */
async function simulateCooldownGranularity() {
    log('\n--- SCENARIO 3: COOLDOWN GRANULARITY ---');
    const entityId = 'tl-multi-violation';

    StrategyEngine.recordOutcome(entityId, 'METRO2-BAL-PAST-DUE', 'DISPUTE_SKILL', 'SUCCESS');

    const profile = createMockProfile('user-4', entityId);
    profile.activeViolations = [
        createMockViolation(entityId, 'METRO2-BAL-PAST-DUE'),
        createMockViolation(entityId, 'METRO2-CO-INCONSISTENT')
    ];

    const strategies = StrategyEngine.generateStrategies(profile);
    log(`Strategies generated: ${strategies.length}`);
    log(`Violations addressed in first strategy: ${strategies[0]?.violationIds.length}`);
}

function createMockProfile(userId: string, entityId: string): UserCreditProfile {
    return {
        userId,
        updatedAt: new Date().toISOString(),
        identity: { name: 'Audit', ssn_partial: '0000', dob: '1990-01-01', addresses: [], employers: [] },
        scores: { lastUpdate: new Date().toISOString(), experian: 0, transunion: 0, equifax: 0 },
        tradelines: [{
            id: entityId,
            bureau: 'EXPERIAN',
            creditor: { value: 'Test', originalValue: 'Test', confidence: 100, source: 'MOCK' },
            accountNumber: { value: '1234', originalValue: '1234', confidence: 100, source: 'MOCK' },
            accountType: { value: 'CC', originalValue: 'CC', confidence: 100, source: 'MOCK' },
            balance: { value: 100, originalValue: '100', confidence: 100, source: 'MOCK' },
            creditLimit: { value: 1000, originalValue: '1000', confidence: 100, source: 'MOCK' },
            pastDueAmount: { value: 0, originalValue: '0', confidence: 100, source: 'MOCK' },
            status: { value: 'Current', originalValue: 'Current', confidence: 100, source: 'MOCK' },
            statusCode: { value: '11', originalValue: '11', confidence: 100, source: 'MOCK' },
            dateOpened: { value: '2020-01-01', originalValue: '2020-01-01', confidence: 100, source: 'MOCK' },
            dateClosed: { value: null, originalValue: 'null', confidence: 100, source: 'MOCK' },
            dateLastActive: { value: null, originalValue: 'null', confidence: 100, source: 'MOCK' },
            paymentHistory: [],
            isDisputed: false,
            remarks: [],
            violations: []
        }],
        collections: [],
        inquiries: [],
        publicRecords: [],
        disputeHistory: [],
        activeFindings: [],
        metrics: { totalDebt: 0, totalLimit: 0, utilization: 0, derogatoryCount: 0, averageAgeMonths: 0 },
        activeViolations: [],
        activeStrategies: []
    };
}

function createMockViolation(entityId: string, ruleId: string = 'METRO2-BAL-PAST-DUE'): Violation {
    return {
        id: uuidv4(),
        rule_id: ruleId,
        severity: 'MEDIUM',
        description: 'Test',
        statute: 'FCRA',
        remedy: 'Fix',
        confidence: 100,
        relatedEntityId: entityId
    };
}

async function run() {
    await simulateLongHorizonConfidence();
    await simulateSelectionBias();
    await simulateCooldownGranularity();
    fs.writeFileSync('audit_results.txt', output);
}

run();
