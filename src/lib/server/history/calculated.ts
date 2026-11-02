import { eq } from 'drizzle-orm';
import { localDate } from '$lib/time';
import { db, schema } from '../db';
import { accountValue, latestBalance, type Account, type AccountValue } from '../ledger/value';
import { amortisedFrom, shareOf, type AmortisedParams, type ShareOfParams } from './schedule';

export type Calculation = typeof schema.calculations.$inferSelect;

export function getCalculation(accountId: number): Calculation | undefined {
	return db
		.select()
		.from(schema.calculations)
		.where(eq(schema.calculations.accountId, accountId))
		.get();
}

/**
 * Calculated accounts: a share of another account's value, or an amortised loan.
 * A balance entered by hand wins whenever it is newer than what the calculation is
 * built on: for a share, newer than the other account's value; for a loan, the
 * schedule restarts from it. Declared as a function so the provider table in
 * ledger/value.ts can reference it despite the import cycle.
 */
export function calculatedValue(account: Account, date: string | null): AccountValue | null {
	const calc = getCalculation(account.id);
	if (!calc) return null;
	const on = date ?? localDate();
	const known = latestBalance(account.id, on);

	if (calc.kind === 'share_of') {
		const p = calc.params as ShareOfParams;
		if (!p?.accountId || p.accountId === account.id) return known;
		const target = db
			.select()
			.from(schema.accounts)
			.where(eq(schema.accounts.id, p.accountId))
			.get();
		const base = target ? accountValue(target, date) : null;
		if (!base) return known;
		if (known && known.asOf >= base.asOf) return known;
		return {
			valueCents: shareOf(base.valueCents, p.shareBp),
			asOf: base.asOf,
			badge: 'calculated'
		};
	}

	if (calc.kind === 'amortised') {
		const p = calc.params as AmortisedParams;
		if (!p?.firstPaymentDate) return known;
		const anchor = known ? { date: known.asOf, valueCents: known.valueCents } : null;
		return { valueCents: amortisedFrom(p, on, anchor), asOf: on, badge: 'calculated' };
	}

	return null;
}
