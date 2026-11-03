import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import {
	createLine,
	deleteLine,
	merchantRule,
	planFromActuals,
	setLineMerchant,
	updateLine
} from './editor';
import { amountFor, amountHistory, planFor } from './lines';
import { createRule } from './engine';
import { budgetMonth } from './month';
import { makeTx, resetBudget } from './testing';

const input = (name: string) => ({
	name,
	group: 'living',
	saverAccountId: null,
	startMonth: null,
	endMonth: null,
	note: null
});

describe('budget editor', () => {
	beforeEach(resetBudget);

	it('keeps old amounts for earlier months when an amount changes', () => {
		const id = createLine(
			input('Food'),
			{ amountCents: 40000, period: 'month', fromMonth: '2026-01' },
			''
		);
		updateLine(
			id,
			input('Food'),
			{ amountCents: 50000, period: 'month', fromMonth: '2026-07' },
			''
		);
		expect(planFor(id, '2026-06')).toBe(40000);
		expect(planFor(id, '2026-07')).toBe(50000);
		// Saving the same figure again does not add a history row.
		updateLine(
			id,
			input('Food'),
			{ amountCents: 50000, period: 'month', fromMonth: '2026-09' },
			''
		);
		expect(amountHistory(id)).toHaveLength(2);
	});

	it('turns weekly and yearly amounts into a monthly plan', () => {
		const w = createLine(
			input('Weekly'),
			{ amountCents: 10000, period: 'week', fromMonth: '2026-01' },
			''
		);
		const y = createLine(
			input('Yearly'),
			{ amountCents: 120000, period: 'year', fromMonth: '2026-01' },
			''
		);
		expect(planFor(w, '2026-02')).toBe(Math.round((10000 * 365.25) / 7 / 12));
		expect(planFor(y, '2026-02')).toBe(10000);
		expect(amountFor(w, '2026-02')?.period).toBe('week');
	});

	it('keeps the merchant on one rule and removes it when emptied', () => {
		const id = createLine(input('Phone'), null, 'Acme');
		expect(merchantRule(id)?.match.merchant).toBe('Acme');
		setLineMerchant(id, 'Phone', 'Bravo');
		expect(db.select().from(schema.rules).all()).toHaveLength(1);
		expect(merchantRule(id)?.match.merchant).toBe('Bravo');
		setLineMerchant(id, 'Phone', '');
		expect(merchantRule(id)).toBeUndefined();
	});

	it('removes a line with its rules and hand choices', () => {
		const id = createLine(input('Phone'), null, 'Acme');
		const t = makeTx('Acme', -2000, '2026-10-01');
		expect(
			db.select().from(schema.assignments).where(eq(schema.assignments.transactionId, t.id)).get()
		).toBeDefined();
		deleteLine(id);
		expect(db.select().from(schema.rules).all()).toHaveLength(0);
		expect(db.select().from(schema.assignments).all()).toHaveLength(0);
	});

	it('plans from a month’s actuals', () => {
		const id = createLine(
			input('Food'),
			{ amountCents: 10000, period: 'month', fromMonth: '2026-01' },
			'Shop'
		);
		makeTx('Shop', -4550, '2026-10-02');
		makeTx('Shop', -3000, '2026-10-20');
		expect(planFromActuals('2026-10', '2026-11')).toBe(1);
		expect(planFor(id, '2026-10')).toBe(10000);
		expect(planFor(id, '2026-11')).toBe(7600);
	});
});

describe('the month view', () => {
	beforeEach(resetBudget);

	it('keeps paid-for-someone-else, repayments, investing and one-offs out of living spend', () => {
		const food = createLine(
			input('Food'),
			{ amountCents: 30000, period: 'month', fromMonth: '2026-01' },
			'Corner'
		);
		makeTx('Corner Store', -10000, '2026-10-02');
		makeTx('Other Shop', -5000, '2026-10-03'); // not sorted yet, still counted
		makeTx('Pat Shop', -7500, '2026-10-04');
		makeTx('Bank Loan', -40000, '2026-10-05');
		makeTx('Fund', -20000, '2026-10-06');
		makeTx('Tax', -9900, '2026-10-07');
		makeTx('Employer', 300000, '2026-10-08');
		const rule = (
			merchant: string,
			action: 'other_person' | 'repayment' | 'investing' | 'one_off' | 'income',
			label: string | null = null
		) =>
			createRule({
				name: merchant,
				enabled: true,
				match: { merchant },
				action,
				budgetLineId: null,
				label
			});
		rule('Pat Shop', 'other_person', 'Pat');
		rule('Bank Loan', 'repayment');
		rule('Fund', 'investing');
		rule('Tax', 'one_off');
		rule('Employer', 'income');

		const m = budgetMonth('2026-10', false);
		expect(m.summary.spendingCents).toBe(15000);
		expect(m.summary.unassignedOutCents).toBe(5000);
		expect(m.people).toMatchObject([{ label: 'Pat', outCents: 7500 }]);
		expect(m.lines.find((l) => l.id === food)).toMatchObject({
			actualCents: 10000,
			planCents: 30000
		});
		expect(m.leftOut.map((l) => l.key).sort()).toEqual([
			'investing',
			'one_off',
			'person:Pat',
			'repayment'
		]);
		expect(budgetMonth('2026-10', true).summary.spendingCents).toBe(15000 + 9900);
	});
});
