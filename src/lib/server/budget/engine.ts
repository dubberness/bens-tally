import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, sqlite } from '../db';
import {
	cleanMatch,
	firstMatch,
	matches,
	type Action,
	type RuleMatch,
	ACTIONS
} from '$lib/budget/rules';

export type Rule = Omit<typeof schema.rules.$inferSelect, 'match'> & { match: RuleMatch };
export type Tx = typeof schema.transactions.$inferSelect;
export type Assignment = typeof schema.assignments.$inferSelect;

export interface Target {
	action: Action;
	budgetLineId?: number | null;
	/** Whose it was, for other_person. */
	label?: string | null;
}

export function isAction(s: unknown): s is Action {
	return typeof s === 'string' && (ACTIONS as readonly string[]).includes(s);
}

/** Rules in the order they are tried. */
export function loadRules(): Rule[] {
	return db
		.select()
		.from(schema.rules)
		.orderBy(asc(schema.rules.sortOrder), asc(schema.rules.id))
		.all() as Rule[];
}

interface Decision {
	action: Action;
	budgetLineId: number | null;
	ruleId: number | null;
	note: string | null;
}

/**
 * What a transaction counts as without a hand choice: a transfer between Ben's
 * own Up accounts needs no rule; otherwise the first enabled matching rule.
 */
export function decide(tx: Tx, rules: Rule[]): Decision | null {
	if (tx.transferUpAccountId)
		return { action: 'transfer', budgetLineId: null, ruleId: null, note: null };
	const r = firstMatch(rules, tx);
	if (!r || !isAction(r.action)) return null;
	return {
		action: r.action,
		budgetLineId: r.budgetLineId ?? null,
		ruleId: r.id,
		note: r.action === 'other_person' ? (r.label ?? null) : null
	};
}

/**
 * Applies the rules to the given transactions (all when omitted). Hand
 * assignments are never touched. Returns how many assignments changed.
 */
export function applyRules(ids?: string[]): number {
	const rules = loadRules();
	const txs: Tx[] = ids
		? ids.length
			? chunked(ids, (part) =>
					db.select().from(schema.transactions).where(inArray(schema.transactions.id, part)).all()
				)
			: []
		: db.select().from(schema.transactions).all();
	if (!txs.length) return 0;
	const existing = new Map<string, Assignment>();
	const assignmentRows = ids
		? chunked(ids, (part) =>
				db
					.select()
					.from(schema.assignments)
					.where(inArray(schema.assignments.transactionId, part))
					.all()
			)
		: db.select().from(schema.assignments).all();
	for (const a of assignmentRows) existing.set(a.transactionId, a);

	let changed = 0;
	const now = new Date();
	sqlite.transaction(() => {
		for (const tx of txs) {
			const cur = existing.get(tx.id);
			if (cur?.byHand) continue;
			const d = decide(tx, rules);
			if (!d) {
				if (cur) {
					db.delete(schema.assignments).where(eq(schema.assignments.transactionId, tx.id)).run();
					changed++;
				}
				continue;
			}
			if (
				cur &&
				cur.action === d.action &&
				cur.budgetLineId === d.budgetLineId &&
				cur.ruleId === d.ruleId &&
				cur.note === d.note
			)
				continue;
			db.insert(schema.assignments)
				.values({ transactionId: tx.id, ...d, byHand: false, at: now })
				.onConflictDoUpdate({
					target: schema.assignments.transactionId,
					set: { ...d, byHand: false, at: now }
				})
				.run();
			changed++;
		}
	})();
	return changed;
}

function chunked<T>(ids: string[], run: (part: string[]) => T[]): T[] {
	const out: T[] = [];
	for (let i = 0; i < ids.length; i += 500) out.push(...run(ids.slice(i, i + 500)));
	return out;
}

/** A hand choice for one transaction; it beats every rule from now on. */
export function assignByHand(txId: string, target: Target) {
	const values = {
		action: target.action,
		budgetLineId: target.action === 'transfer' ? null : (target.budgetLineId ?? null),
		ruleId: null,
		byHand: true,
		note: target.action === 'other_person' ? target.label?.trim() || null : null,
		at: new Date()
	};
	db.insert(schema.assignments)
		.values({ transactionId: txId, ...values })
		.onConflictDoUpdate({ target: schema.assignments.transactionId, set: values })
		.run();
}

/** Drops a hand choice so the rules decide again. */
export function clearHand(txId: string) {
	db.delete(schema.assignments).where(eq(schema.assignments.transactionId, txId)).run();
	applyRules([txId]);
}

export interface RuleInput {
	name: string;
	enabled: boolean;
	match: RuleMatch;
	action: Action;
	budgetLineId: number | null;
	label: string | null;
}

function normalise(input: RuleInput) {
	return {
		name: input.name.trim(),
		enabled: input.enabled,
		match: cleanMatch(input.match),
		action: input.action,
		budgetLineId: input.action === 'transfer' ? null : input.budgetLineId,
		label: input.action === 'other_person' ? input.label?.trim() || null : null
	};
}

/** New rules go first unless a position is given, so a specific rule beats broader ones. */
export function createRule(
	input: RuleInput,
	position: 'first' | 'last' = 'first',
	apply = true
): Rule {
	const edge = db
		.select({
			min: sql<number>`coalesce(min(${schema.rules.sortOrder}), 0)`,
			max: sql<number>`coalesce(max(${schema.rules.sortOrder}), 0)`
		})
		.from(schema.rules)
		.get();
	const now = new Date();
	const row = db
		.insert(schema.rules)
		.values({
			...normalise(input),
			sortOrder: position === 'first' ? (edge?.min ?? 0) - 10 : (edge?.max ?? 0) + 10,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get() as Rule;
	if (apply) applyRules();
	return row;
}

export function updateRule(id: number, input: RuleInput) {
	db.update(schema.rules)
		.set({ ...normalise(input), updatedAt: new Date() })
		.where(eq(schema.rules.id, id))
		.run();
	applyRules();
}

export function setRuleEnabled(id: number, enabled: boolean) {
	db.update(schema.rules)
		.set({ enabled, updatedAt: new Date() })
		.where(eq(schema.rules.id, id))
		.run();
	applyRules();
}

export function deleteRule(id: number) {
	db.delete(schema.rules).where(eq(schema.rules.id, id)).run();
	applyRules();
}

/** Moves a rule up or down one place and renumbers them all. */
export function moveRule(id: number, dir: -1 | 1) {
	const list = loadRules();
	const i = list.findIndex((r) => r.id === id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= list.length) return;
	[list[i], list[j]] = [list[j], list[i]];
	sqlite.transaction(() => {
		list.forEach((r, k) =>
			db
				.update(schema.rules)
				.set({ sortOrder: (k + 1) * 10 })
				.where(eq(schema.rules.id, r.id))
				.run()
		);
	})();
	applyRules();
}

export interface RuleTestHit {
	tx: Tx;
	/** An earlier rule (or a hand choice, or Up's transfer link) that would still win. */
	shadowedBy: string | null;
}

/**
 * What a rule would match among past transactions, before saving it. Hits that
 * an earlier rule, a hand choice or a transfer would still claim are marked.
 */
export function testRule(
	match: RuleMatch,
	opts: { ruleId?: number | null; position?: 'first' | 'last' } = {}
): { hits: RuleTestHit[]; count: number; outCents: number; inCents: number } {
	const m = cleanMatch(match);
	const rules = loadRules().filter((r) => r.id !== opts.ruleId);
	const ownIndex = opts.ruleId
		? loadRules().findIndex((r) => r.id === opts.ruleId)
		: opts.position === 'last'
			? rules.length
			: 0;
	const earlier = rules.slice(0, Math.max(0, ownIndex));
	const hand = new Map(
		db
			.select()
			.from(schema.assignments)
			.where(eq(schema.assignments.byHand, true))
			.all()
			.map((a) => [a.transactionId, a])
	);
	const hits: RuleTestHit[] = [];
	let outCents = 0;
	let inCents = 0;
	const all = db
		.select()
		.from(schema.transactions)
		.orderBy(sql`${schema.transactions.date} desc`)
		.all();
	for (const tx of all) {
		if (!matches(m, tx)) continue;
		let shadowedBy: string | null = null;
		if (hand.has(tx.id)) shadowedBy = 'your hand choice';
		else if (tx.transferUpAccountId) shadowedBy = 'own transfer';
		else {
			const r = firstMatch(earlier, tx);
			if (r) shadowedBy = r.name;
		}
		if (!shadowedBy) {
			if (tx.amountCents < 0) outCents -= tx.amountCents;
			else inCents += tx.amountCents;
		}
		hits.push({ tx, shadowedBy });
	}
	return { hits, count: hits.filter((h) => !h.shadowedBy).length, outCents, inCents };
}
