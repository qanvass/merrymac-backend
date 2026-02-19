
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface Job {
    id: string;
    type: string;
    status: JobStatus;
    payload: any;
    result?: any;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

class JobService {
    private jobs: Map<string, Job> = new Map();

    public createJob(type: string, payload: any): Job {
        const job: Job = {
            id: uuidv4(),
            type,
            status: 'PENDING',
            payload,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.jobs.set(job.id, job);
        return job;
    }

    public async runJob(jobId: string, task: () => Promise<any>) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.status = 'RUNNING';
        job.updatedAt = new Date().toISOString();

        try {
            const result = await task();
            job.status = 'COMPLETED';
            job.result = result;
        } catch (err: any) {
            job.status = 'FAILED';
            job.error = err.message || 'Unknown error';
        } finally {
            job.updatedAt = new Date().toISOString();
        }
    }

    public getJob(jobId: string): Job | undefined {
        return this.jobs.get(jobId);
    }

    public listJobs(): Job[] {
        return Array.from(this.jobs.values());
    }
}

export const jobService = new JobService();
