import { beforeEach, describe, expect, it } from 'vitest';
import { db, schema } from '../db';
import { addDays, localDate } from '$lib/time';
import { payChecks } from './checks';
import { createRule } from './engine';
import { saveSplit, matchRealPay } from './editor';
import { makeAccount, makeTx, resetBudget } from './testing';

/** Six weeks of $1,000 pay and $300 a week moved to a saver, ending today. */
function seed(saverCents = 30000) {
	const spending = makeAccount('Daily');
	const saver = makeAccount('Holiday');
	createRule({
		name: 'Pay',
		enabled: true,
		match: { merchant: 'Employer' },
		action: 'income',
		budgetLineId: null,
		label: null
	});
	for (let i = 0; i < 6; i++) {
		const date = addDays(localDate(), -7 * i);
		makeTx('Employer', 100000, date, { accountId: spending.id });
		makeTx('Transfer from Daily', saverCents, date, {
			accountId: saver.id,
			transferUpAccountId: 'up-daily'
		});
	}
	return { spending, saver };
}

describe('pay checks', () => {
	beforeEach(() => {
		resetBudget();
		db.delete(schema.accounts).run();
	});

	it('says nothing when the plan matches the pay and the transfers', () => {
		const { spending, saver } = seed();
		saveSplit(null, saver.id, 30000, null);
		saveSplit(null, spending.id, 70000, null);
		expect(payChecks()).toEqual([]);
	});

	it('flags a pay split that differs from the pay by more than the tolerance', () => {
		const { spending, saver } = seed();
		saveSplit(null, saver.id, 30000, null);
		saveSplit(null, spending.id, 75000, null);
		const checks = payChecks();
		expect(checks.map((c) => c.key)).toContain('budget:pay-split');
		expect(checks.find((c) => c.key === 'budget:pay-split')?.message).toContain('$50 more');
	});

	it('flags a saver whose real transfers differ from the plan', () => {
		const { saver } = seed(25000);
		saveSplit(null, saver.id, 30000, null);
		const checks = payChecks();
		const c = checks.find((x) => x.key === `budget:saver:${saver.id}`);
		expect(c?.message).toContain('really gets $250');
		expect(c?.message).toContain('plan says $300');
	});

	it('updates the plan to the real transfers', () => {
		const { saver } = seed(25000);
		saveSplit(null, saver.id, 30000, null);
		expect(matchRealPay()).toBe(1);
		expect(db.select().from(schema.paySplits).get()?.amountCents).toBe(25000);
		expect(payChecks().find((x) => x.key.startsWith('budget:saver:'))).toBeUndefined();
	});
});
