import { and, eq, gte, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { matches, type RuleMatch } from '$lib/budget/rules';
import { addDays, addMonths, localDate } from '$lib/time';
import { budgetSetting, BUDGET_SETTINGS } from './settings';
import { loadRules, type Rule } from './engine';

/** A rule that used to match transactions and has gone quiet, with a likely new name. */
export interface MerchantGap {
	rule: Rule;
	lineId: number;
	lineName: string;
	/** Date of the last transaction the rule matched. */
	lastHit: string;
	/** The merchant now showing up under the same Up category, if there is one. */
	candidate: { merchant: string; category: string; count: number } | null;
	/** True when the rule matched in at least three different months before it went quiet. */
	recurring: boolean;
}

interface Row {
	id: string;
	description: string;
	date: string;
	amountCents: number;
	category: string | null;
	parentCategory: string | null;
	action: string | null;
}

/**
 * Budget lines whose merchant rule has not matched anything for a while, which is
 * what happens when a bill moves to another provider. Reads the data only; Ben's
 * fix is to edit the rule's merchant, which makes the gap disappear.
 */
export function merchantGaps(asOf: string = localDate()): MerchantGap[] {
	const gapMonths = budgetSetting<number>(BUDGET_SETTINGS.merchantGapMonths);
	const cutoff = `${addMonths(asOf.slice(0, 7), -gapMonths)}-${asOf.slice(8, 10)}`;
	const t = schema.transactions;
	const rows: Row[] = db
		.select({
			id: t.id,
			description: t.description,
			date: t.date,
			amountCents: t.amountCents,
			category: t.category,
			parentCategory: t.parentCategory,
			action: schema.assignments.action
		})
		.from(t)
		.leftJoin(schema.assignments, eq(schema.assignments.transactionId, t.id))
		.where(and(isNull(t.transferUpAccountId), gte(t.date, addMonths(cutoff.slice(0, 7), -12))))
		.all();
	// Nothing recent at all means the sync is behind, not that a merchant moved.
	if (!rows.some((r) => r.date >= addDays(asOf, -14))) return [];

	const lines = new Map(
		db
			.select()
			.from(schema.budgetLines)
			.all()
			.map((l) => [l.id, l])
	);
	const out: MerchantGap[] = [];
	for (const rule of loadRules()) {
		if (!rule.enabled || rule.action !== 'budget' || rule.budgetLineId == null) continue;
		const line = lines.get(rule.budgetLineId);
		const match = rule.match as RuleMatch;
		if (!line || !match.merchant) continue;
		if (line.endMonth && line.endMonth < asOf.slice(0, 7)) continue;
		const hits = rows.filter((r) => r.amountCents < 0 && matches(match, toTx(r)));
		if (!hits.length || hits.some((h) => h.date >= cutoff)) continue;
		hits.sort((a, b) => b.date.localeCompare(a.date));
		const lastHit = hits[0].date;
		const months = new Set(hits.map((h) => h.date.slice(0, 7)));
		out.push({
			rule,
			lineId: line.id,
			lineName: line.name,
			lastHit,
			candidate: candidateFor(hits, rows, cutoff),
			recurring: months.size >= 3
		});
	}
	return out;
}

const toTx = (r: Row) => ({
	description: r.description,
	amountCents: r.amountCents,
	category: r.category,
	parentCategory: r.parentCategory
});

/** The merchant that appeared since the cutoff under the Up category the old one used. */
function candidateFor(hits: Row[], rows: Row[], cutoff: string) {
	const tally = new Map<string, number>();
	for (const h of hits) if (h.category) tally.set(h.category, (tally.get(h.category) ?? 0) + 1);
	const category = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
	if (!category) return null;
	const old = new Set(hits.map((h) => h.description.toLowerCase()));
	const fresh = new Map<string, number>();
	for (const r of rows) {
		if (r.date < cutoff || r.amountCents >= 0 || r.category !== category) continue;
		// Already sorted by another rule or by hand: not a stray new merchant.
		if (r.action) continue;
		if (old.has(r.description.toLowerCase())) continue;
		fresh.set(r.description, (fresh.get(r.description) ?? 0) + 1);
	}
	const best = [...fresh.entries()].sort((a, b) => b[1] - a[1])[0];
	return best ? { merchant: best[0], category, count: best[1] } : null;
}
