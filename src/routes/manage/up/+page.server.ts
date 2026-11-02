import { fail } from '@sveltejs/kit';
import { asc, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { getSetting } from '$lib/server/settings';
import { lastRun, runJob } from '$lib/server/jobs/scheduler';
import { upToken } from '$lib/server/up/client';
import {
	ACCOUNTS_KEY,
	relinkUpAccount,
	runUpSync,
	syncState,
	upSyncProgress,
	type SeenUpAccount
} from '$lib/server/up/sync';
import { monthEndJob, upSyncJob, MONTH_END_JOB, UP_SYNC_JOB } from '$lib/server/up/jobs';
import { transactionStats } from '$lib/server/up/transactions';
import { lastEndedMonth, monthLabel } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

const runInfo = (job: string) => {
	const r = lastRun(job);
	return r
		? { at: r.startedAt.getTime(), ok: r.ok, message: r.message, finished: r.finishedAt != null }
		: null;
};

export const load: PageServerLoad = () => {
	const seen = getSetting<SeenUpAccount[]>(ACCOUNTS_KEY) ?? [];
	const accounts = db
		.select()
		.from(schema.accounts)
		.where(inArray(schema.accounts.kind, ['cash', 'loan']))
		.orderBy(asc(schema.accounts.sortOrder), asc(schema.accounts.name))
		.all();
	const byId = new Map(accounts.map((a) => [a.id, a]));
	const stats = transactionStats();
	const lastOk = lastRun(UP_SYNC_JOB, true);
	const state = syncState();

	return {
		tokenSet: !!upToken(),
		progress: upSyncProgress(),
		backfillDone: !!state.backfillDone,
		lastSync: runInfo(UP_SYNC_JOB),
		lastOkAt: lastOk ? lastOk.startedAt.getTime() : null,
		monthEnd: runInfo(MONTH_END_JOB),
		lastEndedMonth: monthLabel(lastEndedMonth()),
		upAccounts: seen.map((u) => {
			const a = byId.get(u.accountId);
			const s = stats.get(u.accountId);
			return {
				id: u.id,
				name: u.name,
				type: u.type,
				ownership: u.ownership,
				balanceCents: u.balanceCents,
				account: a ? { id: a.id, name: a.name, closed: !!a.closedOn } : null,
				count: s?.count ?? 0,
				earliest: s?.earliest ?? null,
				// Accounts this Up account could be pointed at instead.
				options: accounts
					.filter(
						(o) =>
							o.kind === (u.type === 'HOME_LOAN' ? 'loan' : 'cash') &&
							!o.closedOn &&
							(!o.upAccountId || o.upAccountId === u.id)
					)
					.map((o) => ({ id: o.id, name: o.name }))
			};
		})
	};
};

export const actions: Actions = {
	sync: async ({ request }) => {
		if (!upToken()) return fail(400, { message: 'Set UP_TOKEN in the container first.' });
		const full = (await request.formData()).get('full') === 'yes';
		const job = full
			? { ...upSyncJob, run: async (now: Date) => (await runUpSync({ now, full: true })).message }
			: upSyncJob;
		// A first sync reads years of history; let it run on and show progress here.
		const done = runJob(job);
		const quick = await Promise.race([
			done,
			new Promise<null>((r) => setTimeout(() => r(null), 8000))
		]);
		if (!quick)
			return { started: true, message: 'Sync is running; this page updates when it ends.' };
		return quick.ok
			? { synced: true, message: quick.message }
			: fail(500, { message: quick.message });
	},
	relink: async ({ request }) => {
		const form = await request.formData();
		const upId = String(form.get('up') ?? '');
		const target = String(form.get('target') ?? '');
		if (!upId || !target) return fail(400, { message: 'Choose an account.' });
		try {
			const dest = relinkUpAccount(upId, target === 'new' ? 'new' : Number(target));
			return { relinked: true, message: `Now linked to ${dest.name}.` };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : String(err) });
		}
	},
	monthEnd: async () => {
		const r = await runJob(monthEndJob);
		return r.ok ? { read: true, message: r.message } : fail(500, { message: r.message });
	}
};
