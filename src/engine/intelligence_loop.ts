
import { sovereignEmitter } from '../events/sovereign_events';
import { UserCreditProfile } from '../types/intelligence_types';
import { ViolationEngine } from './violation_engine';
import { StrategyEngine } from './strategy_engine';
import { orchestrationEngine } from './orchestration_engine';
import { CaseMemory } from './sovereign_engine';
import crypto from 'crypto';

export class IntelligenceLoop {
    private static instance: IntelligenceLoop;
    private queues: Map<string, Promise<void>> = new Map();
    private lastPlanHashes: Map<string, string> = new Map();

    private constructor() {
        this.initialize();
    }

    public static getInstance(): IntelligenceLoop {
        if (!IntelligenceLoop.instance) {
            IntelligenceLoop.instance = new IntelligenceLoop();
        }
        return IntelligenceLoop.instance;
    }

    private initialize() {
        console.log('[Intelligence-Loop] Initializing Closed-Loop Lifecycle Controller...');
    }

    /**
     * Entry point for a profile update in the lifecycle.
     * Implements Sequential Queueing to prevent ingestion starvation.
     */
    public async processProfileUpdate(profile: UserCreditProfile, targetEntityIds?: string[]) {
        const userId = profile.userId;

        // 1. Sequential Queueing (Loop Integrity)
        // Chain the task to the existing user queue
        const existingQueue = this.queues.get(userId) || Promise.resolve();
        const nextTask = existingQueue.then(() => this.executeLifecycle(profile, targetEntityIds));

        this.queues.set(userId, nextTask);

        // Clean up queue memory after completion
        nextTask.finally(() => {
            if (this.queues.get(userId) === nextTask) {
                this.queues.delete(userId);
            }
        });

        return nextTask;
    }

    private async executeLifecycle(profile: UserCreditProfile, targetEntityIds?: string[]) {
        const userId = profile.userId;
        try {
            console.log(`[Intelligence-Loop] Lifecycle triggered for User ${userId}${targetEntityIds ? ` (Targeted: ${targetEntityIds.join(',')})` : ''}`);

            // STAGE 1: Violation Detection & Scoring (Targeted)
            ViolationEngine.scanProfile(profile, targetEntityIds);

            // STAGE 2: Strategy Generation
            StrategyEngine.generateStrategies(profile);

            // STAGE 3: Idempotency Check (Plan Hashing)
            const currentPlanHash = this.generatePlanHash(profile);
            if (this.lastPlanHashes.get(userId) === currentPlanHash) {
                console.log(`[Intelligence-Loop] No drift in strategies for User ${userId}. Skipping orchestration seeding.`);
                this.finalizeProcess(profile);
                return;
            }

            // PERSIST: Save the enriched profile before seeding
            await CaseMemory.saveProfile(profile);

            // STAGE 4: Orchestration Seeding
            console.log('[Intelligence-Loop] Seeding Orchestration Plan...');
            const plan = await orchestrationEngine.generatePlanFromStrategies(profile);

            // Store Hash to prevent duplicate seeding
            this.lastPlanHashes.set(userId, currentPlanHash);

            console.log(`[Intelligence-Loop] Lifecycle Phase Complete. Plan ${plan.id} generated.`);
            this.finalizeProcess(profile);

        } catch (error) {
            console.error(`[Intelligence-Loop] Lifecycle Failure for User ${userId}:`, error);
        }
    }

    private finalizeProcess(profile: UserCreditProfile) {
        sovereignEmitter.emitEvent(profile.userId, {
            case_id: profile.userId,
            phase: 'COMPLETE',
            progress_percentage: 100,
            message: 'LifeCycle: Intelligence Synchronized.',
            payload: profile
        });
    }

    private generatePlanHash(profile: UserCreditProfile): string {
        const strategyFingerprint = profile.activeStrategies.map(s => `${s.type}:${s.targetEntityId}:${s.violationIds.sort().join(',')}`).sort().join('|');
        return crypto.createHash('md5').update(strategyFingerprint).digest('hex');
    }

    /**
     * Callback for when an orchestration plan completes.
     */
    public async handlePlanCompletion(userId: string, targetEntityIds?: string[]) {
        console.log(`[Intelligence-Loop] Feedback Loop Triggered for User ${userId}${targetEntityIds ? ` (Affected: ${targetEntityIds.join(',')})` : ''}`);
        const profile = await CaseMemory.loadProfile(userId);
        if (profile) {
            // Trigger controlled re-scan
            await this.processProfileUpdate(profile, targetEntityIds);
        }
    }
}

export const intelligenceLoop = IntelligenceLoop.getInstance();
