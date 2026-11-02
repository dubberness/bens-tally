import { and, desc, eq, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import { upValue } from '../up/value';
import { investValue } from '../invest/value';
import { calculatedValue } from '../history/calculated';

export type Account = typeof schema.accounts.$inferSelect;

/** Where a shown value came from; drives the source badge. */
export type ValueBadge =
	'live' | 'email' | 'manual' | 'estimate' | 'calculated' | 'sheet' | 'month_end';

export interface AccountValue {
	valueCents: number;
	/** Local date the value is for. */
	asOf: string;
	badge: ValueBadge;
}

/**
 * Value of an account on a date (null = now). An area that knows better
 * (Up, Betashares, calculated accounts) answers first; otherwise the latest
 * balance on or before the date is used. Liabilities are positive amounts owed.
 */
export type ValueProvider = (account: Account, date: string | null) => AccountValue | null;

const providers: Record<string, ValueProvider> = {
	up: upValue,
	betashares: investValue,
	calculated: calculatedValue
};

export function latestBalance(accountId: number, date: string | null): AccountValue | null {
	const where = date
		? and(eq(schema.balances.accountId, accountId), lte(schema.balances.date, date))
		: eq(schema.balances.accountId, accountId);
	const row = db
		.select()
		.from(schema.balances)
		.where(where)
		.orderBy(desc(schema.balances.date), desc(schema.balances.id))
		.limit(1)
		.get();
	if (!row) return null;
	const badge: ValueBadge =
		row.source === 'sheet'
			? 'sheet'
			: row.source === 'month_end'
				? 'month_end'
				: row.reestimate
					? 'estimate'
					: 'manual';
	return { valueCents: row.valueCents, asOf: row.date, badge };
}

export function accountValue(account: Account, date: string | null = null): AccountValue | null {
	return providers[account.source]?.(account, date) ?? latestBalance(account.id, date);
}
