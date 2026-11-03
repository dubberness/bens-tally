import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import {
	applyRules,
	assignByHand,
	clearHand,
	createRule,
	deleteRule,
	moveRule,
	setRuleEnabled,
	testRule
} from './engine';
import { makeLine, makeTx, resetBudget } from './testing';

const assignment = (id: string) =>
	db.select().from(schema.assignments).where(eq(schema.assignments.transactionId, id)).get();
const input = (
	merchant: string,
	action: 'budget' | 'other_person' | 'income',
	line: number | null = null,
	label: string | null = null
) => ({
	name: merchant,
	enabled: true,
	match: { merchant },
	action,
	budgetLineId: line,
	label
});

describe('rules engine', () => {
	beforeEach(resetBudget);

	it('assigns by the first matching rule, newest rule first by default', () => {
		const food = makeLine('Food');
		const fun = makeLine('Fun');
		const shop = makeTx('Corner Shop', -1000, '2026-10-02');
		createRule(input('shop', 'budget', food.id));
		expect(assignment(shop.id)?.budgetLineId).toBe(food.id);
		createRule(input('corner', 'budget', fun.id));
		expect(assignment(shop.id)?.budgetLineId).toBe(fun.id);
		createRule(input('shop', 'budget', food.id), 'last');
		expect(assignment(shop.id)?.budgetLineId).toBe(fun.id);
	});

	it('keeps a hand choice over any rule until it is cleared', () => {
		const food = makeLine('Food');
		const fun = makeLine('Fun');
		const shop = makeTx('Corner Shop', -1000, '2026-10-02');
		createRule(input('shop', 'budget', food.id));
		assignByHand(shop.id, { action: 'budget', budgetLineId: fun.id });
		createRule(input('corner', 'budget', food.id));
		applyRules();
		expect(assignment(shop.id)).toMatchObject({ budgetLineId: fun.id, byHand: true });
		clearHand(shop.id);
		expect(assignment(shop.id)).toMatchObject({ budgetLineId: food.id, byHand: false });
	});

	it('treats a transfer between own accounts as a transfer without any rule', () => {
		const t = makeTx('Transfer to Savings', -5000, '2026-10-02', { transferUpAccountId: 'up-2' });
		createRule(input('transfer', 'budget', makeLine('Misc').id));
		applyRules();
		expect(assignment(t.id)?.action).toBe('transfer');
	});

	it('records whose spending was paid for someone else', () => {
		const t = makeTx('Big Shop', -7000, '2026-10-02');
		createRule(input('big shop', 'other_person', null, 'Pat'));
		expect(assignment(t.id)).toMatchObject({ action: 'other_person', note: 'Pat' });
	});

	it('unassigns when a rule is switched off or deleted', () => {
		const t = makeTx('Corner Shop', -1000, '2026-10-02');
		const r = createRule(input('shop', 'income'));
		expect(assignment(t.id)?.action).toBe('income');
		setRuleEnabled(r.id, false);
		expect(assignment(t.id)).toBeUndefined();
		setRuleEnabled(r.id, true);
		deleteRule(r.id);
		expect(assignment(t.id)).toBeUndefined();
	});

	it('can be reordered', () => {
		const a = makeLine('A');
		const b = makeLine('B');
		const t = makeTx('Corner Shop', -1000, '2026-10-02');
		const first = createRule(input('shop', 'budget', a.id));
		createRule(input('shop', 'budget', b.id), 'last');
		expect(assignment(t.id)?.budgetLineId).toBe(a.id);
		moveRule(first.id, 1);
		expect(assignment(t.id)?.budgetLineId).toBe(b.id);
	});

	it('tests a rule on past transactions and says what an earlier rule would still win', () => {
		const a = makeLine('A');
		makeTx('Acme One', -1000, '2026-09-01');
		makeTx('Acme Two', -2000, '2026-09-02');
		makeTx('Other', -4000, '2026-09-03');
		makeTx('Acme Refund', 500, '2026-09-04');
		createRule(input('two', 'budget', a.id));
		const t = testRule({ merchant: 'acme' }, { position: 'last' });
		expect(t.hits).toHaveLength(3);
		expect(t.count).toBe(2);
		expect(t.outCents).toBe(1000);
		expect(t.inCents).toBe(500);
		expect(t.hits.find((h) => h.tx.description === 'Acme Two')?.shadowedBy).toBe('two');
	});
});
