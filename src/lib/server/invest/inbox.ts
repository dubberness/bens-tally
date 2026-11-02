import { desc, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CsvItemResult } from './csv-import';
import { instrumentFor } from './csv-import';
import type { EmailItemResult } from './email';
import {
	addDistribution,
	addTrade,
	findDistribution,
	findTrade,
	updateDistribution,
	updateTrade
} from './records';

/*
 * The Inbox: imported things the app wouldn't guess about. Each item stays until Ben
 * picks what happens; nothing in here has changed a figure yet.
 */

export type ImportItem = typeof schema.importItems.$inferSelect;

export function inboxCount(): number {
	return db
		.select({ n: sql<number>`count(*)` })
		.from(schema.importItems)
		.where(eq(schema.importItems.status, 'review'))
		.get()!.n;
}

export function inboxItems() {
	const all = db
		.select()
		.from(schema.importItems)
		.where(ne(schema.importItems.source, 'sheet'))
		.orderBy(desc(schema.importItems.receivedAt), desc(schema.importItems.id))
		.limit(200)
		.all();
	// Oldest first within one upload, so CSV rows read in file order.
	const review = all
		.filter((i) => i.status === 'review')
		.sort((a, b) => +b.receivedAt - +a.receivedAt || a.id - b.id);
	const done = all.filter((i) => i.status !== 'review').slice(0, 30);
	const tradeIds = review
		.map((i) => (i.result as CsvItemResult | null)?.kind === 'differs' && i.result)
		.filter(Boolean)
		.map((r) => (r as Extract<CsvItemResult, { kind: 'differs' }>).tradeId);
	const distributionIds = review.flatMap((i) => {
		const r = i.result as EmailItemResult | null;
		return r?.kind === 'income'
			? r.lines.filter((l) => l.distributionId != null).map((l) => l.distributionId!)
			: [];
	});
	const distributions = Object.fromEntries(
		distributionIds.map((id) => [id, findDistribution(id)] as const).filter(([, d]) => !!d)
	);
	const trades = new Map(
		tradeIds.map((id) => [id, findTrade(id)] as const).filter(([, t]) => !!t) as [
			number,
			NonNullable<ReturnType<typeof findTrade>>
		][]
	);
	return { review, done, trades, distributions };
}

export type InboxAction = 'use-file' | 'keep' | 'add' | 'ignore' | 'reopen';

function settle(item: ImportItem, status: 'applied' | 'ignored' | 'review', decision: string) {
	db.update(schema.importItems)
		.set({ status, result: { ...(item.result as object), decision } })
		.where(eq(schema.importItems.id, item.id))
		.run();
}

const orderFree = (orderId: string | null) =>
	!!orderId &&
	!db
		.select({ id: schema.trades.id })
		.from(schema.trades)
		.where(eq(schema.trades.orderId, orderId))
		.get();

/** Carries out Ben's choice. Returns a message when it can't. */
export function resolveItem(id: number, action: InboxAction): string | null {
	const item = db.select().from(schema.importItems).where(eq(schema.importItems.id, id)).get();
	if (!item) return 'That item is gone.';
	if (action === 'reopen') {
		if (item.status !== 'ignored') return 'Only an ignored item can be looked at again.';
		settle(item, 'review', 'Reopened');
		return null;
	}
	if (item.status !== 'review') return 'That one is already done.';
	if (action === 'ignore') {
		settle(item, 'ignored', 'Ignored');
		return null;
	}
	const r = item.result as CsvItemResult | EmailItemResult | null;
	if (r?.kind === 'income') return resolveIncome(item, r, action);
	if (r?.kind !== 'differs') return 'Nothing to apply for this one.';
	const t = r.incoming;
	const trade = findTrade(r.tradeId);
	if (action === 'add') {
		const added = addTrade(
			{
				instrumentId: instrumentFor(t.ticker),
				date: t.date,
				side: t.side,
				unitsE6: t.unitsE6,
				priceE4: t.priceE4,
				valueCents: t.valueCents,
				feeCents: t.feeCents,
				orderId: t.orderId,
				note: null
			},
			item.source,
			item.id
		);
		if (typeof added === 'string') return added;
		settle(item, 'applied', 'Added as a new trade');
		return null;
	}
	if (!trade) return "The app's trade was deleted since; add it as a new one or ignore this.";
	if (action === 'use-file') {
		const err = updateTrade(
			trade.id,
			{
				date: t.date,
				unitsE6: t.unitsE6,
				priceE4: t.priceE4,
				valueCents: t.valueCents,
				feeCents: t.feeCents,
				...(t.orderId && (trade.orderId === t.orderId || orderFree(t.orderId))
					? { orderId: t.orderId }
					: {})
			},
			item.source === 'csv' ? 'From the Betashares CSV' : 'From a Betashares email'
		);
		if (err) return err;
		db.update(schema.trades)
			.set({ importItemId: item.id })
			.where(eq(schema.trades.id, trade.id))
			.run();
		settle(item, 'applied', "Used the file's figures");
		return null;
	}
	// keep: the app's figures stay, but the order ID still links them so it isn't asked again.
	if (t.orderId && !trade.orderId && orderFree(t.orderId))
		updateTrade(trade.id, { orderId: t.orderId }, 'Order ID from an import; figures kept');
	settle(item, 'ignored', 'Kept the app’s figures');
	return null;
}

/** An income email whose lines differ from distributions the app has. */
function resolveIncome(
	item: ImportItem,
	r: Extract<EmailItemResult, { kind: 'income' }>,
	action: InboxAction
): string | null {
	if (action === 'keep') {
		settle(item, 'ignored', 'Kept the app’s figures');
		return null;
	}
	if (action !== 'use-file') return 'Nothing to do that with.';
	for (const l of r.lines) {
		if (l.outcome !== 'differs') continue;
		const err =
			l.distributionId != null && findDistribution(l.distributionId)
				? updateDistribution(
						l.distributionId,
						{
							date: l.incoming.date,
							amountCents: l.incoming.amountCents,
							reinvested: l.incoming.reinvested,
							unitsE6: l.incoming.unitsE6,
							perUnitE6: l.incoming.perUnitE6
						},
						'From a Betashares email'
					)
				: (() => {
						const id = addDistribution(l.incoming, 'email', item.id);
						return typeof id === 'string' ? id : null;
					})();
		if (err) return `${l.ticker}: ${err}`;
	}
	settle(item, 'applied', "Used the email's figures");
	return null;
}
