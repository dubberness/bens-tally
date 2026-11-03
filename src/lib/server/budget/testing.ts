import { db, schema } from '../db';
import { onTransactionsSynced } from './hooks';

let n = 0;

/** Test helper: a cash account. */
export function makeAccount(name = 'Spending') {
	const now = new Date();
	return db
		.insert(schema.accounts)
		.values({ name, kind: 'cash', side: 'asset', source: 'manual', createdAt: now, updatedAt: now })
		.returning()
		.get();
}

/** Test helper: an Up transaction in the mirror. Amount in cents, negative = out. */
export function makeTx(
	description: string,
	amountCents: number,
	date: string,
	extra: Partial<typeof schema.transactions.$inferInsert> = {}
) {
	const at = new Date(`${date}T12:00:00+11:00`);
	const row = db
		.insert(schema.transactions)
		.values({
			id: `tx-${++n}`,
			upAccountId: 'up-1',
			status: 'SETTLED',
			description,
			amountCents,
			date,
			createdAt: at,
			syncedAt: at,
			...extra
		})
		.returning()
		.get();
	onTransactionsSynced([row.id]); // as the Up sync does
	return row;
}

/** Test helper: a budget line with a monthly plan from a month. */
export function makeLine(name: string, group = 'living', monthlyCents = 0, from = '2026-01') {
	const now = new Date();
	const row = db
		.insert(schema.budgetLines)
		.values({ name, group, createdAt: now, updatedAt: now })
		.returning()
		.get();
	db.insert(schema.budgetAmounts)
		.values({ lineId: row.id, fromMonth: from, amountCents: monthlyCents, period: 'month' })
		.run();
	return row;
}

/** Test helper: empties everything the budget area keeps, so each test starts clean. */
export function resetBudget() {
	for (const t of [
		schema.assignments,
		schema.rules,
		schema.transactions,
		schema.yearlyBills,
		schema.paySplits,
		schema.budgetAmounts,
		schema.budgetLines,
		schema.settings
	])
		db.delete(t).run();
}
