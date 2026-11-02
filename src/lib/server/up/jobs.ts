import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Job } from '../jobs/types';
import { every } from '../jobs/when';
import { lastDayOfMonth, localDate, localMinutes, monthLabel } from '$lib/time';
import { formatMoney } from '$lib/money';
import { upToken } from './client';
import { runUpSync } from './sync';
import { monthEndDue, monthsToRead, readMonthEnd } from './monthend';

export const UP_SYNC_JOB = 'up-sync';
export const MONTH_END_JOB = 'month-end';

const END_MINUTES = 23 * 60 + 59;
const isMonthEndMinute = (at: Date) =>
	localDate(at) === lastDayOfMonth(localDate(at).slice(0, 7)) && localMinutes(at) >= END_MINUTES;

/** Every 15 minutes, plus a final read at 11:59 pm on the last day of the month. */
export function upSyncDue(now: Date, lastOk: Date | null): boolean {
	if (every(15)(now, lastOk)) return true;
	return isMonthEndMinute(now) && !!lastOk && !isMonthEndMinute(lastOk);
}

function lastOkRun(job: string): Date | null {
	return (
		db
			.select({ at: schema.jobRuns.startedAt })
			.from(schema.jobRuns)
			.where(and(eq(schema.jobRuns.job, job), eq(schema.jobRuns.ok, true)))
			.orderBy(desc(schema.jobRuns.startedAt))
			.get()?.at ?? null
	);
}

let monthEndAttempt = 0;

export const upSyncJob: Job = {
	id: UP_SYNC_JOB,
	label: 'Up sync',
	when: 'Every 15 minutes, and 11:59 pm on the last day of the month',
	due: (now, lastOk) => !!upToken() && upSyncDue(now, lastOk),
	run: async (now) => (await runUpSync({ now })).message
};

export const monthEndJob: Job = {
	id: MONTH_END_JOB,
	label: 'Month-end reading',
	when: '11:59 pm on the last day of the month',
	// A failed run (Up down) is retried every 10 minutes until it works.
	due: (now, lastOk) => monthEndDue(now, lastOk) && now.getTime() - monthEndAttempt >= 10 * 60_000,
	run: async (now) => {
		monthEndAttempt = now.getTime();
		let syncError: string | null = null;
		if (upToken()) {
			try {
				await runUpSync({ now });
			} catch (err) {
				syncError = err instanceof Error ? err.message : String(err);
			}
		}
		const lines: string[] = [];
		for (const month of monthsToRead(now, lastOkRun(MONTH_END_JOB))) {
			const r = readMonthEnd(month, { now, skipSources: syncError ? ['up'] : [] });
			const total = r.written.reduce((s, w) => s + w.valueCents, 0);
			let line = `${monthLabel(month)}: ${r.written.length} read (${formatMoney(total)})`;
			if (r.existing) line += `, ${r.existing} already had a balance`;
			if (r.missing.length) line += `, no value for ${r.missing.join(', ')}`;
			lines.push(line);
		}
		if (syncError)
			throw new Error(
				`Up sync failed, Up accounts left for a retry: ${syncError}. ${lines.join('; ')}`
			);
		return lines.join('; ');
	}
};

/** Scheduled jobs for this area; the scheduler runs them with the others. */
export const upJobs: Job[] = [upSyncJob, monthEndJob];
