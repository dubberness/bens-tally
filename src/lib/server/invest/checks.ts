import { localDate } from '$lib/time';
import type { CheckSource } from '../checks/types';
import { isWeekday } from '../jobs/when';
import { latestPriceDates } from './prices';
import { mixProblems } from './view';

const mixChecks: CheckSource = () =>
	mixProblems().map((p) => ({
		...p,
		level: 'info' as const,
		fixHref: '/manage/instruments',
		fixLabel: 'Fix targets'
	}));

/** Trading days (weekdays) after `date` up to today. */
function tradingDaysSince(date: string, today: string): number {
	let n = 0;
	const d = new Date(`${date}T12:00:00Z`);
	const end = new Date(`${today}T12:00:00Z`);
	while (d < end) {
		d.setUTCDate(d.getUTCDate() + 1);
		if (isWeekday(d)) n++;
	}
	return n;
}

/** A held fund whose feed price is two or more trading days old. */
const staleChecks: CheckSource = () => {
	const today = localDate();
	return latestPriceDates()
		.filter((p) => p.source !== 'manual')
		.filter((p) => !p.date || tradingDaysSince(p.date, today) >= 2)
		.map((p) => ({
			key: `invest:stale-price:${p.ticker}`,
			level: 'warn' as const,
			message: p.date
				? `${p.ticker}'s price hasn't updated since ${p.date}.`
				: `${p.ticker} has no price yet.`,
			fixHref: '/manage/instruments',
			fixLabel: 'Prices',
			fingerprint: p.date ?? 'none'
		}));
};

export const investChecks: CheckSource[] = [mixChecks, staleChecks];
