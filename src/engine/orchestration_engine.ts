
import { ForensicFinding, CanonicalCase } from '../types/sovereign_types';
import { UserCreditProfile } from '../types/intelligence_types';
import { v4 as uuidv4 } from 'uuid';
import { disputeLetterSkill } from '../skills/dispute_letter.skill';
import { cfpbComplaintSkill } from '../skills/cfpb_complaint.skill';
import { creditKarmaSyncSkill } from '../skills/credit_karma_sync.skill';
import { myficoSyncSkill } from '../skills/myfico_sync.skill';
import { emailService } from '../services/email';
import { intelligenceLoop } from './intelligence_loop';
import { StrategyEngine } from './strategy_engine';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SkillContext {
    caseId: string;
    finding: ForensicFinding;
    metadata?: Record<string, any>;
}

export interface SkillResult {
    success: boolean;
    output?: any;
    error?: string;
    outcome?: 'LEGAL_REJECTION' | 'SYSTEM_ERROR' | 'SUCCESS';
    auditTrailId: string;
}

export interface OrchestrationSkill {
    id: string;
    name: string;
    description: string;
    riskProfile: RiskLevel;
    legalCitations: string[];
    applicability: (finding: ForensicFinding) => boolean;
    execute: (context: SkillContext) => Promise<SkillResult>;
}

export interface PlanStep {
    id: string;
    skillId: string;
    status: 'QUEUED' | 'PENDING_APPROVAL' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
    context: SkillContext;
    result?: SkillResult;
    scheduledAt: string;
}

export interface ExecutionPlan {
    id: string;
    caseId: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    steps: PlanStep[];
    ledger: string[]; // IDs of audit trail entries
    createdAt: string;
}

class OrchestrationEngine {
    private skillRegistry: Map<string, OrchestrationSkill> = new Map();

    constructor() {
        this.registerSkill(disputeLetterSkill);
        this.registerSkill(cfpbComplaintSkill);
        this.registerSkill(creditKarmaSyncSkill);
        this.registerSkill(myficoSyncSkill);
    }

    public registerSkill(skill: OrchestrationSkill) {
        this.skillRegistry.set(skill.id, skill);
        console.log(`[Orchestration] Registered Skill: ${skill.id}`);
    }

    public async generatePlan(caseData: CanonicalCase): Promise<ExecutionPlan> {
        console.log(`[Orchestration] Synthesizing plan for Case ${caseData.case_id}...`);

        const steps: PlanStep[] = [];

        // Dynamic Discovery Loop
        for (const finding of caseData.findings) {
            const applicableSkills = Array.from(this.skillRegistry.values())
                .filter(skill => skill.applicability(finding));

            for (const skill of applicableSkills) {
                steps.push({
                    id: uuidv4(),
                    skillId: skill.id,
                    status: 'QUEUED',
                    context: {
                        caseId: caseData.case_id,
                        finding
                    },
                    scheduledAt: new Date().toISOString()
                });
            }
        }

        return {
            id: uuidv4(),
            caseId: caseData.case_id,
            status: 'PENDING',
            steps,
            ledger: [],
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Seeds an ExecutionPlan directly from the Strategy Intelligence Layer.
     */
    public async generatePlanFromStrategies(profile: UserCreditProfile): Promise<ExecutionPlan> {
        console.log(`[Orchestration] Seeding plan from Strategy Intelligence for User ${profile.userId}...`);

        const steps: PlanStep[] = [];

        for (const strategy of profile.activeStrategies) {
            const skillIdMap: Record<string, string> = {
                'DISPUTE': 'GENERATE_DISPUTE_LETTER_V1',
                'CFPB_COMPLAINT': 'SUBMIT_CFPB_COMPLAINT_V1',
            };

            const skillId = skillIdMap[strategy.type];
            if (skillId && this.skillRegistry.has(skillId)) {
                steps.push({
                    id: uuidv4(),
                    skillId,
                    status: 'QUEUED',
                    context: {
                        caseId: profile.userId,
                        finding: {
                            rule_id: `STRATEGY-${strategy.type}`,
                            severity: strategy.removalProbability,
                            confidence: 100,
                            description: strategy.recommendedAction,
                            statute: strategy.declarativeMetadata.statute || 'Multiple Statutes',
                            remedy: strategy.recommendedAction,
                            estimated_value: 0,
                            related_entity_id: strategy.targetEntityId
                        },
                        metadata: strategy.declarativeMetadata
                    },
                    scheduledAt: new Date().toISOString()
                });
            }
        }

        return {
            id: uuidv4(),
            caseId: profile.userId,
            status: 'PENDING',
            steps,
            ledger: [],
            createdAt: new Date().toISOString()
        };
    }

    public async executeStep(plan: ExecutionPlan, stepId: string): Promise<ExecutionPlan> {
        const step = plan.steps.find(s => s.id === stepId);
        if (!step) throw new Error("Step not found in plan");

        const skill = this.skillRegistry.get(step.skillId);
        if (!skill) throw new Error(`Skill ${step.skillId} not found`);

        // RISK GATE: Human-in-the-Loop (HITL)
        if (skill.riskProfile === 'HIGH' && step.status !== 'PENDING_APPROVAL') {
            console.log(`[Orchestration] Skill ${skill.id} requires approval. Sending request...`);
            await emailService.requestApproval({
                description: `${skill.name}: Addressing ${step.context.finding.rule_id}`,
                target: `Case ${step.context.caseId}`,
                riskLevel: skill.riskProfile
            });
            step.status = 'PENDING_APPROVAL';
            return plan;
        }

        try {
            step.status = 'EXECUTING';
            plan.status = 'IN_PROGRESS';

            const result = await skill.execute(step.context);
            step.result = result;
            step.status = result.success ? 'COMPLETED' : 'FAILED';

            // Assign Outcome Type
            if (result.success) {
                result.outcome = 'SUCCESS';
            } else {
                // If it's a known legal rejection (placeholder logic), mark as such
                const isLegalRejection = result.error?.toLowerCase().includes('duplicate') || result.error?.toLowerCase().includes('verified');
                result.outcome = isLegalRejection ? 'LEGAL_REJECTION' : 'SYSTEM_ERROR';
            }

            // DRIFT DETECTION: Predicted vs Actual (Only penalize on Legal outcomes)
            const predicted = step.context.metadata?.removalProbability || 0;
            const actual = result.success ? 100 : 0;
            const driftDelta = actual - predicted;

            if (result.outcome === 'LEGAL_REJECTION' || result.outcome === 'SUCCESS') {
                console.log(`[Drift-Detection] Skill ${skill.id} for User ${step.context.caseId}: Predicted ${predicted}%, Actual ${actual}%, Delta ${driftDelta}%`);
            } else {
                console.log(`[Drift-Detection] SYSTEM ERROR for Skill ${skill.id}. Skipping drift penalty.`);
            }

            // Feed drift back to Strategy Engine (Categorized)
            if (step.context.finding.related_entity_id) {
                StrategyEngine.recordOutcome(
                    step.context.finding.related_entity_id,
                    step.context.finding.rule_id,
                    step.skillId,
                    result.outcome || (result.success ? 'SUCCESS' : 'SYSTEM_ERROR')
                );
            }

            if (result.success) {
                plan.ledger.push(result.auditTrailId);
            }
        } catch (err: any) {
            step.status = 'FAILED';
            step.result = {
                success: false,
                error: err.message,
                outcome: 'SYSTEM_ERROR',
                auditTrailId: 'FAILED_INTERNAL'
            };

            // Feed System Error back (no drift penalty should occur)
            if (step.context.finding.related_entity_id) {
                StrategyEngine.recordOutcome(
                    step.context.finding.related_entity_id,
                    step.context.finding.rule_id,
                    step.skillId,
                    'SYSTEM_ERROR'
                );
            }
        }

        // Finalize plan status
        const allCompleted = plan.steps.every(s => s.status === 'COMPLETED');
        const anyFailed = plan.steps.some(s => s.status === 'FAILED');

        if (allCompleted) {
            plan.status = 'COMPLETED';
            // Trigger Feedback Loop with affected entity IDs
            const affectedEntityIds = Array.from(new Set(plan.steps.map(s => s.context.finding.related_entity_id).filter(id => !!id) as string[]));
            intelligenceLoop.handlePlanCompletion(plan.caseId, affectedEntityIds);
        }
        else if (anyFailed) plan.status = 'FAILED';

        return plan;
    }

    public getSkill(id: string): OrchestrationSkill | undefined {
        return this.skillRegistry.get(id);
    }
}

export const orchestrationEngine = new OrchestrationEngine();
