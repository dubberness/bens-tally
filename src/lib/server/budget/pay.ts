import { and, desc, eq, gt, gte, isNotNull, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import { addDays, daysBetween, localDate } from '$lib/time';
import { budgetSetting, BUDGET_SETTINGS, type PayFrequency } from './settings';

export interface RegularPay {
	/** Who pays it (the merchant on the deposits). */
	source: string;
	/** Middle of the last few deposits, so a one-off bonus doesn't move it. */
	regularCents: number;
	latestCents: number;
	latestDate: string;
	/** 0 = Sunday, from the latest deposit. */
	weekday: number;
	frequency: PayFrequency;
	/** The account pay lands in. */
	accountId: number | null;
	deposits: { date: string; amountCents: number }[];
}

const median = (xs: number[]) => {
	if (!xs.length) return 0;
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * The real pay, from deposits assigned to income: the biggest income source over
 * the last 90 days, and the middle of its last four deposits.
 */
export function regularPay(asOf: string = localDate()): RegularPay | null {
	const rows = db
		.select({
			date: schema.transactions.date,
			amountCents: schema.transactions.amountCents,
			description: schema.transactions.description,
			accountId: schema.transactions.accountId
		})
		.from(schema.transactions)
		.innerJoin(schema.assignments, eq(schema.assignments.transactionId, schema.transactions.id))
		.where(
			and(
				eq(schema.assignments.action, 'income'),
				gt(schema.transactions.amountCents, 0),
				lte(schema.transactions.date, asOf),
				gte(schema.transactions.date, addDays(asOf, -90))
			)
		)
		.orderBy(desc(schema.transactions.date))
		.all();
	if (!rows.length) return null;
	const totals = new Map<string, number>();
	for (const r of rows) totals.set(r.description, (totals.get(r.description) ?? 0) + r.amountCents);
	const source = [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0];
	const deposits = rows.filter((r) => r.description === source);
	const last = deposits.slice(0, 4);
	const gaps = deposits
		.slice(0, 6)
		.flatMap((d, i, a) => (i ? [daysBetween(d.date, a[i - 1].date)] : []));
	const gap = median(gaps);
	const stored = budgetSetting<PayFrequency>(BUDGET_SETTINGS.payFrequency);
	const frequency: PayFrequency = gaps.length
		? gap <= 9
			? 'week'
			: gap <= 18
				? 'fortnight'
				: 'month'
		: stored;
	const [y, m, d] = deposits[0].date.split('-').map(Number);
	return {
		source,
		regularCents: median(last.map((r) => r.amountCents)),
		latestCents: deposits[0].amountCents,
		latestDate: deposits[0].date,
		weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
		frequency,
		accountId: deposits[0].accountId,
		deposits: last.map((r) => ({ date: r.date, amountCents: r.amountCents }))
	};
}

export const PERIOD_DAYS: Record<PayFrequency, number> = { week: 7, fortnight: 14, month: 30 };

/**
 * What each account really receives from Ben's other accounts per pay period:
 * the middle of the last `periods` period totals, so one lump doesn't skew it.
 */
export function realTransfersIn(
	frequency: PayFrequency,
	asOf: string = localDate(),
	periods = 4
): Map<number, number> {
	const days = PERIOD_DAYS[frequency];
	const from = addDays(asOf, -days * periods + 1);
	const rows = db
		.select({
			accountId: schema.transactions.accountId,
			date: schema.transactions.date,
			amountCents: schema.transactions.amountCents
		})
		.from(schema.transactions)
		.where(
			and(
				isNotNull(schema.transactions.transferUpAccountId),
				gt(schema.transactions.amountCents, 0),
				gte(schema.transactions.date, from),
				lte(schema.transactions.date, asOf)
			)
		)
		.all();
	const buckets = new Map<number, number[]>();
	for (const r of rows) {
		if (r.accountId == null) continue;
		const k = Math.floor(daysBetween(from, r.date) / days);
		const b = buckets.get(r.accountId) ?? new Array(periods).fill(0);
		b[k] += r.amountCents;
		buckets.set(r.accountId, b);
	}
	const out = new Map<number, number>();
	for (const [id, b] of buckets) out.set(id, median(b));
	return out;
}
