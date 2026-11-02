import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { getSetting } from '../settings';
import { localDate } from '$lib/time';
import type { ValueProvider } from '../ledger/value';

/**
 * Up accounts. Now: the live balance from the last sync. A past date: the live balance
 * less every transaction created after that day, which rebuilds the balance exactly,
 * because Up lists every transaction (holds included) and its balance includes them.
 * Round-ups sit on the purchase, not in its amount, so they are counted here too.
 * Returns null (so the latest stored balance is used) until there is a live balance
 * and the full history has been loaded.
 */
export const upValue: ValueProvider = (account, date) => {
	const live = db
		.select()
		.from(schema.liveBalances)
		.where(eq(schema.liveBalances.accountId, account.id))
		.get();
	if (!live) return null;
	const today = localDate(live.fetchedAt);
	if (date === null || date >= today) {
		return { valueCents: live.valueCents, asOf: date ?? today, badge: 'live' };
	}
	if (!getSetting<{ backfillDone?: boolean }>('up.sync')?.backfillDone) return null;
	const after = db
		.select({
			cents: sql<number>`coalesce(sum(${schema.transactions.amountCents} + coalesce(json_extract(${schema.transactions.raw}, '$.attributes.roundUp.amount.valueInBaseUnits'), 0)), 0)`
		})
		.from(schema.transactions)
		.where(and(eq(schema.transactions.accountId, account.id), gt(schema.transactions.date, date)))
		.get();
	const upCents = account.side === 'liability' ? -live.valueCents : live.valueCents;
	const past = upCents - (after?.cents ?? 0);
	return {
		valueCents: account.side === 'liability' ? -past : past,
		asOf: date,
		badge: 'live'
	};
};
