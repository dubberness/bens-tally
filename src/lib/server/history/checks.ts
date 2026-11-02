import { desc, eq } from 'drizzle-orm';
import { addDays, daysBetween, localDate, monthEnd, monthName } from '$lib/time';
import { db, schema } from '../db';
import type { Check, CheckSource } from '../checks/types';
import { allAccounts, isOpenOn, monthToClose } from './snapshots';

/** Days after a month ends before an unclosed month is flagged. */
const CLOSE_GRACE_DAYS = 3;

const monthNotClosed: CheckSource = () => {
	const today = localDate();
	const due = monthToClose(today);
	if (!due || today <= addDays(monthEnd(due.month), CLOSE_GRACE_DAYS)) return [];
	return [
		{
			key: `history:month-not-closed:${due.month}`,
			level: 'warn',
			message: `${monthName(due.month)} still isn’t closed.`,
			fixHref: '/months/close',
			fixLabel: 'Close it',
			fingerprint: due.month
		}
	];
};

const manualStale: CheckSource = () => {
	const today = localDate();
	const out: Check[] = [];
	for (const a of allAccounts()) {
		if (a.source !== 'manual' || !a.updateEveryDays || !isOpenOn(a, today)) continue;
		const last = db
			.select({ date: schema.balances.date })
			.from(schema.balances)
			.where(eq(schema.balances.accountId, a.id))
			.orderBy(desc(schema.balances.date))
			.limit(1)
			.get();
		const age = last ? daysBetween(last.date, today) : null;
		if (age != null && age <= a.updateEveryDays) continue;
		out.push({
			key: `history:manual-stale:${a.id}`,
			level: 'info',
			message: last
				? `${a.name} was last updated ${age} days ago.`
				: `${a.name} has no balance yet.`,
			fixHref: `/accounts/${a.id}`,
			fixLabel: 'Update',
			fingerprint: last?.date ?? 'none'
		});
	}
	return out;
};

export const historyChecks: CheckSource[] = [monthNotClosed, manualStale];
