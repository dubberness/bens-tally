import { eq, min } from 'drizzle-orm';
import { monthEnd } from '$lib/time';
import { db, schema, sqlite } from '../db';
import type { Breakdown } from './breakdown';
import { boughtAtCost, recordEdit } from './snapshots';

/** The date of the earliest trade, or null with no trades. */
export function firstTradeDate(): string | null {
	return (
		db
			.select({ d: min(schema.trades.date) })
			.from(schema.trades)
			.get()?.d ?? null
	);
}

export interface BoughtChange {
	month: string;
	oldBought: number;
	newBought: number;
}

/**
 * Move locked months whose "bought ETFs" came from the sheet's cost table over to trade
 * dates, the way the app works out its own months. A month counts once its last day is on
 * or after the first trade; months before that keep the sheet's figure. Only `bought` and
 * `markets` change, by the same amount in opposite directions, so net worth, the other
 * parts and the total stay as they were and markets is still the investing change less
 * bought. Safe to run again: a month already on trades is left alone.
 *
 * With a `reason`, each month whose figure changed also gets an entry in its edit history.
 */
export function boughtFromTrades(reason?: string): BoughtChange[] {
	const first = firstTradeDate();
	if (!first) return [];
	const changes: BoughtChange[] = [];
	sqlite.transaction(() => {
		const rows = db
			.select()
			.from(schema.snapshots)
			.where(eq(schema.snapshots.status, 'locked'))
			.all();
		for (const snap of rows) {
			const b = snap.breakdown as Breakdown | null;
			if (!b || b.boughtSource !== 'sheet' || !b.prevMonth || monthEnd(snap.month) < first)
				continue;
			const newBought = boughtAtCost(monthEnd(b.prevMonth), monthEnd(snap.month));
			const next: Breakdown = {
				...b,
				bought: newBought,
				boughtSource: 'trades',
				markets: b.markets + b.bought - newBought
			};
			db.update(schema.snapshots)
				.set({ breakdown: next, updatedAt: new Date() })
				.where(eq(schema.snapshots.month, snap.month))
				.run();
			if (newBought === b.bought) continue;
			changes.push({ month: snap.month, oldBought: b.bought, newBought });
			if (reason) recordEdit(snap.month, 'bought', b.bought, newBought, reason);
		}
	})();
	return changes;
}
