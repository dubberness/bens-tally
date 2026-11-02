import { describe, expect, it } from 'vitest';
import { discountFrom, ruleOn, taxYears, type TaxedDisposal, type TaxRule } from './tax';

const rule = (fromDate: string, discountBp: number, toDate: string | null = null): TaxRule => ({
	id: 1,
	fromDate,
	toDate,
	discountBp,
	holdingMonths: 12,
	note: null,
	origin: 'app',
	createdAt: new Date(),
	updatedAt: new Date()
});
const d = (date: string, gain: number, discountBp = 0): TaxedDisposal => ({
	date,
	boughtOn: '2020-01-01',
	unitsE6: 1e6,
	costCents: 0,
	proceedsCents: gain * 100,
	gainCents: gain * 100,
	ticker: 'TST',
	discountBp
});

describe('tax rules', () => {
	it('passes the holding period the day after the anniversary', () => {
		expect(discountFrom('2026-04-01', 12)).toBe('2027-04-02');
		expect(discountFrom('2024-02-29', 12)).toBe('2025-03-01');
	});
	it('uses the rule in force on the date', () => {
		const rules = [rule('2000-01-01', 5000, '2027-06-30'), rule('2027-07-01', 3300)];
		expect(ruleOn(rules, '2027-06-30')?.discountBp).toBe(5000);
		expect(ruleOn(rules, '2027-07-01')?.discountBp).toBe(3300);
		expect(ruleOn(rules, '1999-01-01')).toBeNull();
	});
});

describe('taxYears', () => {
	it('halves a long-held gain', () => {
		const [y] = taxYears([d('2025-08-01', 1000, 5000)]);
		expect(y).toMatchObject({ label: '2025–26', netGainCents: 50_000, discountCents: 50_000 });
	});

	it('takes losses off undiscounted gains first', () => {
		const [y] = taxYears([
			d('2025-08-01', 1000, 5000),
			d('2025-09-01', 300),
			d('2025-10-01', -400)
		]);
		// 400 loss: 300 off the short gain, 100 off the long one; then half of 900.
		expect(y.netGainCents).toBe(45_000);
		expect(y.totalCents).toBe(90_000);
	});

	it('carries a net loss into later years, before the discount', () => {
		const [a, b] = taxYears([d('2026-10-15', -468), d('2027-09-01', 1000, 5000)]);
		expect(a).toMatchObject({ netGainCents: 0, carryForwardCents: 46_800, totalCents: -46_800 });
		expect(b).toMatchObject({ broughtForwardCents: 46_800, netGainCents: 26_600 });
	});
});
