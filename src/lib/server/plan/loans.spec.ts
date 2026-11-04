import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { setCalculation } from '../history/accounts-admin';
import { planLoans } from './loans';
import { planContext } from './context';

const now = new Date();
const make = (name: string, kind: string, side: 'asset' | 'liability', source = 'manual') =>
	db
		.insert(schema.accounts)
		.values({ name, kind, side, source, createdAt: now, updatedAt: now })
		.returning()
		.get();
const bal = (accountId: number, date: string, valueCents: number) =>
	db
		.insert(schema.balances)
		.values({ accountId, date, valueCents, source: 'manual', reestimate: false, createdAt: now })
		.run();

describe('loans in the Plan', () => {
	const home = make('Plan home', 'property', 'asset');
	const byHand = make('Plan hand loan', 'loan', 'liability');
	const schedule = make('Plan schedule loan', 'loan', 'liability', 'calculated');
	const share = make('Plan share', 'loan', 'liability', 'calculated');
	const plain = make('Plan plain debt', 'loan', 'liability');
	const closed = make('Plan closed loan', 'loan', 'liability');
	const stuck = make('Plan stuck loan', 'loan', 'liability');
	const cleared = make('Plan cleared loan', 'loan', 'liability');

	setCalculation(byHand.id, 'loan_terms', { annualRateBp: 600, repaymentCents: 1_000_00 });
	bal(byHand.id, '2030-05-31', 100_000_00);
	setCalculation(schedule.id, 'amortised', {
		principalCents: 50_000_00,
		annualRateBp: 0,
		repaymentCents: 500_00,
		firstPaymentDate: '2030-01-10',
		payments: 100
	});
	setCalculation(share.id, 'share_of', { accountId: home.id, shareBp: 1_000 });
	bal(home.id, '2030-05-31', 500_000_00);
	bal(plain.id, '2030-05-31', 9_000_00);
	setCalculation(closed.id, 'loan_terms', { annualRateBp: 600, repaymentCents: 1_000_00 });
	bal(closed.id, '2030-05-31', 5_000_00);
	db.update(schema.accounts)
		.set({ closedOn: '2030-05-31' })
		.where(eq(schema.accounts.id, closed.id))
		.run();
	setCalculation(stuck.id, 'loan_terms', { annualRateBp: 1_200, repaymentCents: 100_00 });
	bal(stuck.id, '2030-05-31', 80_000_00);
	setCalculation(cleared.id, 'loan_terms', { annualRateBp: 600, repaymentCents: 1_000_00 });
	bal(cleared.id, '2030-05-31', 0);

	const loans = planLoans('2030-06-15');
	const find = (id: number) => loans.find((l) => l.id === id);

	it('lists loans with terms or a schedule, leaving out shares, plain debts, closed and cleared ones', () => {
		expect(loans.map((l) => l.id).sort()).toEqual([byHand.id, schedule.id, stuck.id].sort());
	});

	it('is biggest balance first', () => {
		expect(loans.map((l) => l.balanceCents)).toEqual(
			[...loans.map((l) => l.balanceCents)].sort((a, b) => b - a)
		);
	});

	it('carries a hand-entered balance forward by the repayments since, then counts the months left', () => {
		const l = find(byHand.id)!;
		// one repayment fell at the end of May's balance date, so June's (30th) is not yet made:
		// the balance is the May figure
		expect(l.balanceCents).toBe(100_000_00);
		expect(l.repaymentCents).toBe(1_000_00);
		// $100k at 6% repaying $1,000 a month: about 138 months
		expect(l.monthsLeft!).toBeGreaterThan(137);
		expect(l.monthsLeft!).toBeLessThan(139);
	});

	it('uses the schedule balance and stops at the contracted number of repayments', () => {
		const l = find(schedule.id)!;
		// 6 repayments made by mid June (10 Jan to 10 Jun): 47,000 left at 500 a month = 94 months,
		// which is also 100 - 6
		expect(l.balanceCents).toBe(47_000_00);
		expect(l.monthsLeft).toBe(94);
	});

	it('leaves months unknown when the repayment never clears the interest', () => {
		expect(find(stuck.id)!.monthsLeft).toBeNull();
	});

	it('goes into the Plan context', () => {
		expect(planContext('2030-06-15').loans.map((l) => l.id)).toEqual(loans.map((l) => l.id));
	});
});
