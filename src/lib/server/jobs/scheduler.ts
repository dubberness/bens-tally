import { and, desc, eq, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { log } from '../log';
import { runBackup } from './backup';
import { pruneSessions } from '../auth/session';
import type { Job } from './types';
import { dailyAfter } from './when';
import { historyJobs } from '../history/jobs';
import { upJobs } from '../up/jobs';
import { investJobs } from '../invest/jobs';
import { budgetJobs } from '../budget/jobs';

export type { Job };
export { dailyAfter };

const coreJobs: Job[] = [
	{
		id: 'backup',
		label: 'Backup',
		when: 'Nightly, 2:30 am',
		due: dailyAfter(2, 30),
		run: (now) => runBackup(now)
	},
	{
		id: 'tidy',
		label: 'Tidy up',
		when: 'Nightly, 3:00 am',
		due: dailyAfter(3, 0),
		run: () => {
			const sessions = pruneSessions();
			const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
			const runs = db
				.delete(schema.jobRuns)
				.where(lt(schema.jobRuns.startedAt, cutoff))
				.run().changes;
			return `Removed ${sessions} expired sessions and ${runs} old job records`;
		}
	}
];

export const jobs: Job[] = [...coreJobs, ...upJobs, ...investJobs, ...historyJobs, ...budgetJobs];

const running = new Set<string>();

export function lastRun(jobId: string, okOnly = false) {
	const where = okOnly
		? and(eq(schema.jobRuns.job, jobId), eq(schema.jobRuns.ok, true))
		: eq(schema.jobRuns.job, jobId);
	return db
		.select()
		.from(schema.jobRuns)
		.where(where)
		.orderBy(desc(schema.jobRuns.startedAt))
		.get();
}

export async function runJob(
	job: Job,
	now = new Date()
): Promise<{ ok: boolean; message: string }> {
	if (running.has(job.id)) return { ok: false, message: 'Already running' };
	running.add(job.id);
	const id = db
		.insert(schema.jobRuns)
		.values({ job: job.id, startedAt: now })
		.returning({ id: schema.jobRuns.id })
		.get().id;
	let ok = true;
	let message: string;
	try {
		message = await job.run(now);
	} catch (err) {
		ok = false;
		message = err instanceof Error ? err.message : String(err);
		log('error', `Job ${job.id} failed`, { message });
	} finally {
		running.delete(job.id);
	}
	db.update(schema.jobRuns)
		.set({ finishedAt: new Date(), ok, message })
		.where(eq(schema.jobRuns.id, id))
		.run();
	return { ok, message };
}

async function tick() {
	const now = new Date();
	for (const job of jobs) {
		const last = lastRun(job.id, true);
		if (job.due(now, last ? last.startedAt : null)) await runJob(job, now);
	}
}

/** Start the once-a-minute loop (once per process, even across dev hot reloads). */
export function startScheduler() {
	const g = globalThis as unknown as { __tallyScheduler?: NodeJS.Timeout };
	if (g.__tallyScheduler) return;
	g.__tallyScheduler = setInterval(() => void tick(), 60_000);
	setTimeout(() => void tick(), 5_000);
	log('info', 'Scheduler started', { jobs: jobs.map((j) => j.id) });
}
