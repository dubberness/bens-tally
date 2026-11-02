import { localMonth } from '$lib/time';
import { db, schema } from '../db';
import { every } from '../jobs/when';
import type { Job } from '../jobs/types';
import { refreshOpenMonth } from './snapshots';

/** Keeps the current month's open snapshot up to date, so Months and exports show it. */
const openMonth: Job = {
	id: 'history.open-month',
	label: 'Refresh this month’s snapshot',
	when: 'Every hour',
	due: every(60),
	run: (now) => {
		if (!db.select({ id: schema.accounts.id }).from(schema.accounts).limit(1).get())
			return 'No accounts yet';
		const s = refreshOpenMonth(localMonth(now));
		return s.status === 'locked' ? `${s.month} is locked` : `${s.month} refreshed`;
	}
};

export const historyJobs: Job[] = [openMonth];
