import { describe, expect, it } from 'vitest';
import { summarise, type SpendRow } from './spending';

let n = 0;
const tx = (amountCents: number, action: SpendRow['action'], extra: Partial<SpendRow> = {}) =>
	({ id: `t${++n}`, amountCents, action, budgetLineId: null, ...extra }) as SpendRow;

describe('summarise', () => {
	const month: SpendRow[] = [
		tx(-100_00, 'budget', { budgetLineId: 1 }),
		tx(-50_00, 'budget', { budgetLineId: 1 }),
		tx(10_00, 'budget', { budgetLineId: 1 }), // refund
		tx(-30_00, null), // not assigned yet: still spending
		tx(200_00, null), // money in nobody assigned: not counted
		tx(-500_00, 'transfer'),
		tx(-80_00, 'other_person', { label: 'Pat' }),
		tx(-20_00, 'other_person', { label: 'Pat' }),
		tx(60_00, 'other_person', { label: 'Pat' }),
		tx(-400_00, 'repayment', { budgetLineId: 2 }),
		tx(-250_00, 'investing'),
		tx(-120_00, 'one_off'),
		tx(1000_00, 'income'),
		tx(5_00, 'income')
	];

	it('measures spending from money out, leaving out what is not Ben’s own', () => {
		const s = summarise(month);
		expect(s.spendingCents).toBe(100_00 + 50_00 - 10_00 + 30_00);
		expect(s.unassignedOutCents).toBe(30_00);
		expect(s.unassignedInCents).toBe(200_00);
		expect(s.incomeCents).toBe(1005_00);
		expect(s.repaymentsCents).toBe(400_00);
		expect(s.investingCents).toBe(250_00);
		expect(s.oneOffCents).toBe(120_00);
		expect(s.otherPeople).toEqual([{ label: 'Pat', outCents: 100_00, inCents: 60_00 }]);
		expect(s.lineSpend.get(1)).toBe(140_00);
		expect(s.lineKept.get(2)).toBe(400_00);
	});

	it('counts one-offs only in the one-off view', () => {
		expect(summarise(month, { includeOneOffs: true }).spendingCents).toBe(170_00 + 120_00);
	});

	it('works out the savings rate net of repayments', () => {
		const s = summarise(month);
		expect(s.savingsRate).toBeCloseTo((1005_00 - 170_00 - 400_00) / 1005_00, 10);
		expect(summarise([tx(-10_00, null)]).savingsRate).toBeNull();
	});

	it('groups other people by label, with a fallback', () => {
		const s = summarise([
			tx(-10_00, 'other_person', { label: 'A' }),
			tx(-30_00, 'other_person', { label: null }),
			tx(-5_00, 'other_person', { label: 'A' })
		]);
		expect(s.otherPeople.map((p) => [p.label, p.outCents])).toEqual([
			['Someone else', 30_00],
			['A', 15_00]
		]);
		expect(s.spendingCents).toBe(0);
	});
});
