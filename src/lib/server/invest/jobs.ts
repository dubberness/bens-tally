import { localDate, localMinutes } from '$lib/time';
import type { Job } from '../jobs/types';
import { every, isWeekday } from '../jobs/when';
import { collectEmails, emailConfigured } from './email';
import { updatePrices } from './prices';

const OPEN = 10 * 60;
const CLOSE = 16 * 60 + 20;

/**
 * Every 15 minutes while the ASX is open (10:00 to 4:20 pm on weekdays, Hobart and Sydney
 * share a clock), once after the close for the final price, and straight away the first time.
 */
export function pricesDue(now: Date, lastOk: Date | null): boolean {
	if (!lastOk) return true;
	if (!isWeekday(now)) return false;
	const m = localMinutes(now);
	if (m >= OPEN && m < CLOSE) return every(15)(now, lastOk);
	if (m >= CLOSE) return localDate(lastOk) < localDate(now) || localMinutes(lastOk) < CLOSE;
	return false;
}

export const pricesJob: Job = {
	id: 'invest.prices',
	label: 'Fund prices',
	when: 'Every 15 minutes while the ASX is open, and after the close',
	due: pricesDue,
	run: async (now) => (await updatePrices(now)).message
};

export const emailJob: Job = {
	id: 'invest.email',
	label: 'Betashares emails',
	when: 'Every 15 minutes, once the mail Worker is set up',
	due: (now, lastOk) => emailConfigured() && every(15)(now, lastOk),
	run: (now) => collectEmails(now)
};

/** Scheduled jobs for this area; the scheduler runs them with the others. */
export const investJobs: Job[] = [pricesJob, emailJob];
