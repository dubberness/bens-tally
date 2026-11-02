import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Check, CheckSource } from '../checks/types';
import { upToken } from './client';

const UP_SYNC_JOB = 'up-sync';
const STALE_MS = 60 * 60 * 1000;

function last(okOnly: boolean) {
	const where = okOnly
		? and(eq(schema.jobRuns.job, UP_SYNC_JOB), eq(schema.jobRuns.ok, true))
		: eq(schema.jobRuns.job, UP_SYNC_JOB);
	return db
		.select()
		.from(schema.jobRuns)
		.where(where)
		.orderBy(desc(schema.jobRuns.startedAt))
		.get();
}

/** Up token missing, or the last sync failed. */
export const upTokenCheck: CheckSource = () => {
	if (!upToken())
		return [
			{
				key: 'up:token-missing',
				level: 'warn',
				message: 'Up isn’t connected: the container has no UP_TOKEN setting.',
				fixHref: '/manage/up',
				fixLabel: 'How to connect',
				fingerprint: 'missing'
			}
		];
	const run = last(false);
	if (run && run.finishedAt && run.ok === false)
		return [
			{
				key: 'up:sync-failed',
				level: 'warn',
				message: `The last Up sync failed: ${run.message ?? 'no details'}`,
				fixHref: '/manage/up',
				fixLabel: 'Open Up Bank',
				fingerprint: run.message ?? ''
			}
		];
	return [];
};

/** No successful sync for over an hour while a token is set. */
export function upStaleCheck(now = new Date()): Check[] {
	if (!upToken()) return [];
	const ok = last(true);
	const since = ok ? now.getTime() - ok.startedAt.getTime() : Infinity;
	if (since <= STALE_MS) return [];
	return [
		{
			key: 'up:stale',
			level: 'warn',
			message: ok
				? `Up balances haven’t updated for ${Math.floor(since / STALE_MS)} hours.`
				: 'Up hasn’t synced yet.',
			fixHref: '/manage/up',
			fixLabel: 'Sync now',
			fingerprint: ok ? String(ok.startedAt.getTime()) : 'never'
		}
	];
}

export const upChecks: CheckSource[] = [upTokenCheck, () => upStaleCheck()];
