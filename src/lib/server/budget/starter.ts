import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { matches } from '$lib/budget/rules';
import { createRule } from './engine';

/**
 * Starter rules: a line named after what it is paid to ("<provider>") gets a rule
 * "merchant has <name>", but only when that really matches an Up transaction.
 * Lines that already have a rule are left alone. Returns how many rules it made.
 */
export function suggestLineRules(origin: 'app' | 'sheet' = 'app'): number {
	const lines = db.select().from(schema.budgetLines).all();
	const ruled = new Set(
		db
			.select({ id: schema.rules.budgetLineId })
			.from(schema.rules)
			.where(and(eq(schema.rules.action, 'budget'), isNotNull(schema.rules.budgetLineId)))
			.all()
			.map((r) => r.id)
	);
	const txs = db
		.select({ description: schema.transactions.description })
		.from(schema.transactions)
		.where(isNull(schema.transactions.transferUpAccountId))
		.all();
	let made = 0;
	for (const l of lines) {
		const merchant = l.name.trim();
		if (!merchant || ruled.has(l.id)) continue;
		if (!txs.some((t) => matches({ merchant }, { description: t.description, amountCents: 0 })))
			continue;
		const rule = createRule(
			{
				name: l.name,
				enabled: true,
				match: { merchant },
				action: 'budget',
				budgetLineId: l.id,
				label: null
			},
			'last',
			false
		);
		if (origin === 'sheet')
			db.update(schema.rules).set({ origin }).where(eq(schema.rules.id, rule.id)).run();
		made++;
	}
	return made;
}
