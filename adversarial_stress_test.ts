
import { intelligenceLoop } from './src/engine/intelligence_loop';
import { StrategyEngine } from './src/engine/strategy_engine';
import { UserCreditProfile, Violation } from './src/types/intelligence_types';
import { v4 as uuidv4 } from 'uuid';

/**
 * RED-TEAM STIMULUS: HIGH-FREQUENCY INGEST STORM
 */
async function simulateIngestStorm() {
    console.log('\n--- SCENARIO 1: INGEST STORM ---');
    const userId = 'adversary-001';
    const profile: UserCreditProfile = createMockProfile(userId);

    // 5 rapid triggers
    console.log('Spawning 5 rapid ingestion triggers...');
    const results = await Promise.all([
        intelligenceLoop.processProfileUpdate(profile),
        intelligenceLoop.processProfileUpdate(profile),
        intelligenceLoop.processProfileUpdate(profile),
        intelligenceLoop.processProfileUpdate(profile),
        intelligenceLoop.processProfileUpdate(profile)
    ]);

    // Audit: Mutex vs Queue
    // Now using Sequential Queueing, so all 5 should process in order.
}

/**
 * RED-TEAM STIMULUS: PARTIAL EXECUTION FAILURE
 */
async function simulatePartialFailure() {
    console.log('\n--- SCENARIO 2: PARTIAL EXECUTION FAILURE ---');
    const entityId = 'tl-fail-002';

    // Simulate Strategy Seeding with Legal Rejections
    StrategyEngine.recordOutcome(entityId, 'DISPUTE_SKILL', 'LEGAL_REJECTION');
    StrategyEngine.recordOutcome(entityId, 'DISPUTE_SKILL', 'LEGAL_REJECTION');

    const profile = createMockProfile('user-fail');
    const violations: Violation[] = [{
        id: 'v1',
        rule_id: 'METRO2-BAL-PAST-DUE',
        severity: 'HIGH',
        description: 'Test',
        statute: 'FCRA',
        remedy: 'Fix',
        confidence: 100,
        relatedEntityId: entityId
    }];
    profile.activeViolations = violations;

    const strategies = StrategyEngine.generateStrategies(profile);
    console.log(`Removal Probability after 2 legal failures: ${strategies[0]?.removalProbability}%`);
}

/**
 * RED-TEAM STIMULUS: CONFLICTED DATA INJECTION
 */
async function simulateConflictedData() {
    console.log('\n--- SCENARIO 3: CONFLICTED DATA ---');
    const profile = createMockProfile('user-conflict');
    const tl = profile.tradelines[0];

    // Conflict Injection
    tl.balance = {
        value: 0,
        originalValue: 'CONFLICT', // Triggering the freeze logic
        confidence: 95,
        source: 'PDF'
    };

    const violations: Violation[] = [{
        id: 'v-conflict',
        rule_id: 'METRO2-BAL-PAST-DUE',
        severity: 'HIGH',
        description: 'Conflict Test',
        statute: 'FCRA',
        remedy: 'Fix',
        confidence: 100,
        relatedEntityId: tl.id
    }];
    profile.activeViolations = violations;

    const strategies = StrategyEngine.generateStrategies(profile);
    console.log(`Strategies generated for conflicted account: ${strategies.length}`);
}

function createMockProfile(userId: string): UserCreditProfile {
    return {
        userId,
        updatedAt: new Date().toISOString(),
        identity: {
            name: 'Adversary',
            ssn_partial: '0000',
            dob: '1990-01-01',
            addresses: [],
            employers: []
        },
        scores: { lastUpdate: new Date().toISOString() },
        tradelines: [{
            id: 'tl-' + uuidv4().slice(0, 8),
            bureau: 'EXPERIAN',
            creditor: { value: 'Test AMEX', originalValue: 'AMEX', confidence: 100, source: 'MYFICO' },
            accountNumber: { value: '1234', originalValue: '1234', confidence: 100, source: 'MYFICO' },
            accountType: { value: 'Credit Card', originalValue: 'CC', confidence: 100, source: 'MYFICO' },
            balance: { value: 1000, originalValue: '1000', confidence: 100, source: 'MYFICO' },
            creditLimit: { value: 5000, originalValue: '5000', confidence: 100, source: 'MYFICO' },
            pastDueAmount: { value: 0, originalValue: '0', confidence: 100, source: 'MYFICO' },
            status: { value: 'Current', originalValue: 'Current', confidence: 100, source: 'MYFICO' },
            statusCode: { value: '11', originalValue: '11', confidence: 100, source: 'MYFICO' },
            dateOpened: { value: '2020-01-01', originalValue: '2020-01-01', confidence: 100, source: 'MYFICO' },
            dateClosed: { value: null, originalValue: null, confidence: 100, source: 'MYFICO' },
            dateLastActive: { value: null, originalValue: null, confidence: 100, source: 'MYFICO' },
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
