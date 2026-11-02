import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { accountValue, latestBalance, type Account } from '../ledger/value';
import { lastDayOfMonth, lastEndedMonth, addMonths } from '$lib/time';

/** Account sources that read themselves at month end; the rest are typed in by Ben. */
export const AUTO_SOURCES = ['up', 'betashares', 'calculated'] as const;

export interface MonthEndResult {
	month: string;
	date: string;
	written: { accountId: number; name: string; valueCents: number }[];
	/** Already had a balance for that date. */
	existing: number;
	/** No source could give a value. */
	missing: string[];
	/** Left out on purpose (e.g. Up accounts while Up couldn't be reached). */
	skipped: string[];
	/** The month hasn't reached its 11:59 pm reading yet. */
	notYet: boolean;
}

export interface MonthEndOptions {
	now?: Date;
	/** Leave these account sources out (the job passes ['up'] when the sync failed). */
	skipSources?: string[];
}

/**
 * Writes a month-end reading (balances row, source 'month_end', dated the month's last day)
 * for every account open on that day whose source reads itself: Up, Betashares and calculated
 * accounts. An account that already has a balance on that date is left alone, so running this
 * twice changes nothing. A month before its 11:59 pm reading is refused (notYet), so an early
 * call can't freeze a value that would still move. Call runUpSync() first for fresh Up figures.
 */
export function readMonthEnd(month: string, opts: MonthEndOptions = {}): MonthEndResult {
	const now = opts.now ?? new Date();
	const date = lastDayOfMonth(month);
	const result: MonthEndResult = {
		month,
		date,
		written: [],
		existing: 0,
		missing: [],
		skipped: [],
		notYet: month > lastEndedMonth(now)
	};
	if (result.notYet) return result;

	const accounts = db
		.select()
		.from(schema.accounts)
		.where(inArray(schema.accounts.source, [...AUTO_SOURCES]))
		.all()
		.filter((a) => (!a.closedOn || a.closedOn > date) && (!a.openedOn || a.openedOn <= date));

	db.transaction((tx) => {
		for (const a of accounts) {
			if (opts.skipSources?.includes(a.source)) {
				result.skipped.push(a.name);
				continue;
			}
			const has = tx
				.select({ id: schema.balances.id })
				.from(schema.balances)
				.where(and(eq(schema.balances.accountId, a.id), eq(schema.balances.date, date)))
				.get();
			if (has) {
				result.existing++;
				continue;
			}
			const value = providerValue(a, date);
			if (value === null) {
				result.missing.push(a.name);
				continue;
			}
			tx.insert(schema.balances)
				.values({
					accountId: a.id,
					date,
					valueCents: value,
					source: 'month_end',
					createdAt: now
				})
				.run();
			result.written.push({ accountId: a.id, name: a.name, valueCents: value });
		}
	});
	return result;
}

/**
 * The account's own source's value on the date, or null when it could only fall back to an
 * older stored balance (copying that forward as a "reading" would hide a stale figure).
 */
function providerValue(account: Account, date: string): number | null {
	const v = accountValue(account, date);
	if (!v) return null;
	const stored = latestBalance(account.id, date);
	if (
		stored &&
		stored.valueCents === v.valueCents &&
		stored.asOf === v.asOf &&
		stored.badge === v.badge
	)
		return null;
	return v.valueCents;
}

/** Month-end job timing: due once the latest ended month hasn't been read since it ended. */
export function monthEndDue(now: Date, lastOk: Date | null): boolean {
	return !lastOk || lastEndedMonth(lastOk) < lastEndedMonth(now);
}

/** Months to read: every month that ended since the last good run (just the latest on a first run). */
export function monthsToRead(now: Date, lastOk: Date | null): string[] {
	const latest = lastEndedMonth(now);
	if (!lastOk) return [latest];
	const out: string[] = [];
	for (let m = addMonths(lastEndedMonth(lastOk), 1); m <= latest; m = addMonths(m, 1)) out.push(m);
	return out.length ? out : [latest];
}
