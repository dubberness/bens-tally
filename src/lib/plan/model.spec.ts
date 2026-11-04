import { describe, expect, it } from 'vitest';
import { annuity, loanPayment, requirement, runPlan, type PlanInputs } from './model';

const base: PlanInputs = {
	age: 30,
	year: 2030,
	outside: 0,
	super: 0,
	spendYear: 30_000,
	investYear: 20_000,
	superYear: 10_000,
	realReturn: 0,
	withdrawal: 0.04,
	accessAge: 60,
	endAge: 65
};

describe('annuity', () => {
	it('is spending times years with no return', () => {
		expect(annuity(1000, 0, 5)).toBe(5000);
	});
	it('discounts later payments', () => {
		expect(annuity(1000, 0.1, 2)).toBeCloseTo(1000 / 1.1 + 1000 / 1.21, 6);
	});
	it('is zero when there are no years', () => {
		expect(annuity(1000, 0.05, 0)).toBe(0);
	});
});

describe('requirement', () => {
	it('adds the bridge to the shortfall of super at access age', () => {
		// 2 years to access: bridge 60k; super 100k needs 750k, so 650k short
		const r = requirement({ ...base, age: 58 }, 58, 100_000);
		expect(r.bridge).toBe(60_000);
		expect(r.shortfall).toBe(650_000);
		expect(r.total).toBe(710_000);
	});
	it('brings the shortfall back at the return', () => {
		const inp = { ...base, realReturn: 0.1 };
		const r = requirement(inp, 58, 100_000);
		// super grows 21% to 121k, short 629k at 60, worth 629k / 1.21 today
		expect(r.shortfall).toBeCloseTo((750_000 - 121_000) / 1.21, 6);
	});
	it('has no shortfall once super alone is enough', () => {
		expect(requirement(base, 59, 800_000).shortfall).toBe(0);
	});
});

describe('runPlan', () => {
	it('finds the first age where outside money covers bridge plus shortfall (hand-worked, no return)', () => {
		// at k years from now: O = 20k*k, S = 10k*k. Need O >= 30k*(30-k) + max(0, 750k - 10k*k)
		// k=27: 540k < 570k; k=28: 560k >= 530k.
		const r = runPlan(base);
		expect(r.freeAge).toBe(58);
		expect(r.freeYear).toBe(2058);
		expect(r.yearsAway).toBe(28);
		expect(r.atFree?.bridge).toBe(60_000);
		expect(r.atFree?.shortfall).toBe(470_000);
		expect(r.atFree?.outside).toBe(560_000);
	});

	it('is free today when outside money already covers it', () => {
		const r = runPlan({ ...base, outside: 2_000_000 });
		expect(r.freeAge).toBe(30);
		expect(r.yearsAway).toBe(0);
	});

	it('says not before access age when out of reach', () => {
		const r = runPlan({ ...base, investYear: 0, superYear: 0 });
		expect(r.freeAge).toBeNull();
		expect(r.freeYear).toBeNull();
		expect(r.series.every((p) => p.phase === 'build')).toBe(true);
	});

	it('can be free exactly at the access age', () => {
		const r = runPlan({
			...base,
			age: 55,
			accessAge: 60,
			outside: 0,
			super: 760_000,
			investYear: 0,
			superYear: 0
		});
		// super alone covers E/w by 60; needs bridge 150k outside now. Not enough at 55..59
		expect(r.freeAge).toBe(60);
	});

	it('checks only today when already past the access age', () => {
		const rich = runPlan({ ...base, age: 62, outside: 400_000, super: 400_000 });
		expect(rich.freeAge).toBe(62);
		const poor = runPlan({ ...base, age: 62, outside: 100_000, super: 400_000 });
		expect(poor.freeAge).toBeNull();
	});

	it('meets the requirement at the free age and fails the year before', () => {
		const inp: PlanInputs = {
			...base,
			outside: 50_000,
			super: 80_000,
			realReturn: 0.045,
			spendYear: 36_000,
			investYear: 13_000,
			superYear: 6_500
		};
		const r = runPlan(inp);
		expect(r.freeAge).not.toBeNull();
		const at = r.series.find((p) => p.age === r.freeAge)!;
		const need = requirement(inp, at.age, at.super);
		expect(at.outside).toBeGreaterThanOrEqual(need.total - 1e-6);
		const before = r.series.find((p) => p.age === r.freeAge! - 1);
		if (before) {
			const nb = requirement(inp, before.age, before.super);
			expect(before.outside).toBeLessThan(nb.total);
		}
	});

	it('lives off outside money to the access age, then super pays', () => {
		const inp: PlanInputs = {
			...base,
			outside: 50_000,
			super: 80_000,
			realReturn: 0.04,
			investYear: 15_000,
			superYear: 6_000
		};
		const r = runPlan(inp);
		const free = r.freeAge!;
		const atAccess = r.series.find((p) => p.age === inp.accessAge)!;
		// what outside money holds beyond the bridge keeps growing and is not drawn
		const o0 = r.series.find((p) => p.age === free)!.outside;
		const leftOver =
			(o0 - requirement(inp, free, r.series.find((p) => p.age === free)!.super).bridge) *
			Math.pow(1.04, inp.accessAge - free);
		expect(atAccess.outside).toBeCloseTo(leftOver, 4);
		expect(atAccess.outside).toBeGreaterThanOrEqual(0);
		// super stops contributions at the free age and only grows until access
		const s0 = r.series.find((p) => p.age === free)!.super;
		expect(atAccess.super).toBeCloseTo(s0 * Math.pow(1.04, inp.accessAge - free), 4);
		expect(r.series.find((p) => p.age === free)!.phase).toBe(
			free < inp.accessAge ? 'bridge' : 'super'
		);
		expect(r.series.find((p) => p.age === inp.accessAge)!.phase).toBe('super');
		// after access, super pays spending each year
		const next = r.series.find((p) => p.age === inp.accessAge + 1)!;
		expect(next.super).toBeCloseTo(atAccess.super * 1.04 - inp.spendYear, 4);
	});

	it('covers the years to the end age', () => {
		const r = runPlan({ ...base, age: 40, endAge: 70 });
		expect(r.series[0]).toMatchObject({ age: 40, year: 2030 });
		expect(r.series.at(-1)?.age).toBe(70);
		expect(r.series.at(-1)?.year).toBe(2060);
	});

	it('never plots a negative balance', () => {
		const r = runPlan({
			...base,
			outside: 0,
			super: 0,
			investYear: 0,
			superYear: 0,
			spendYear: 50_000,
			accessAge: 40,
			age: 41,
			endAge: 45
		});
		expect(r.series.every((p) => p.outside >= 0 && p.super >= 0)).toBe(true);
	});
});

describe('loan repayments after work stops', () => {
	const loan = { amountYear: 12_000, years: 20 };

	it('changes nothing with no loans, an empty list or a loan with nothing left', () => {
		const plain = runPlan(base);
		expect(runPlan({ ...base, loans: [] })).toEqual(plain);
		expect(
			runPlan({ ...base, loans: [{ amountYear: 12_000, years: 0 }], inflation: 0.03 })
		).toEqual(plain);
		expect(requirement({ ...base, loans: [] }, 57, 0)).toMatchObject({ loans: 0, bridge: 90_000 });
	});

	it('adds nothing for a loan paid off before the free age', () => {
		const plain = runPlan(base);
		// free at 58 (28 years away); a loan with 5 years left is long gone by then
		const r = runPlan({ ...base, loans: [{ amountYear: 12_000, years: 5 }] });
		expect(r.freeAge).toBe(plain.freeAge);
		expect(r.atFree?.loans).toBe(0);
		expect(r.series.at(-1)).toEqual(plain.series.at(-1));
	});

	it('adds the value at the free age of the repayments still due, with no return or inflation', () => {
		// at 40 (10 years in), 10 more years of 12k are still due
		expect(requirement({ ...base, loans: [loan] }, 40, 0).loans).toBe(120_000);
		// a part year counts in proportion: 9.5 years left at 40 is 9.5 repayments
		expect(
			requirement({ ...base, loans: [{ amountYear: 12_000, years: 19.5 }] }, 40, 0).loans
		).toBe(114_000);
	});

	it('pushes the free age later when a loan runs past it', () => {
		// 30 years of 12k running past the free age of 58 (to 60): two repayments after it
		const r = runPlan({ ...base, loans: [{ amountYear: 12_000, years: 30 }] });
		// k=28 needs 560k vs 530k + 24k (two years of repayments); 560k >= 554k still holds
		expect(r.freeAge).toBe(58);
		// a bigger repayment tips it over: at k=28 O = 560k but needs 530k + 2 * 20k = 570k
		const bigger = runPlan({ ...base, loans: [{ amountYear: 20_000, years: 30 }] });
		expect(bigger.freeAge).toBe(59);
		expect(bigger.freeAge!).toBeGreaterThan(runPlan(base).freeAge!);
	});

	it('counts repayments that run beyond the access age too', () => {
		const inp = { ...base, loans: [{ amountYear: 10_000, years: 40 }] };
		// at 40 (10 years in), 30 years of repayments are due, 20 of them after the access age
		expect(requirement(inp, 40, 0).loans).toBe(300_000);
	});

	it('shrinks repayments by inflation and discounts them at the return', () => {
		const inp: PlanInputs = {
			...base,
			realReturn: 0.05,
			inflation: 0.1,
			loans: [{ amountYear: 12_000, years: 2 }]
		};
		expect(loanPayment(inp, 1)).toBeCloseTo(12_000 / 1.1, 6);
		expect(loanPayment(inp, 2)).toBeCloseTo(12_000 / 1.21, 6);
		expect(loanPayment(inp, 3)).toBe(0);
		const pv = 12_000 / 1.1 / 1.05 + 12_000 / 1.21 / 1.05 ** 2;
		expect(requirement(inp, 30, 0).loans).toBeCloseTo(pv, 6);
		// at 31 only the second repayment is left, valued one year on
		expect(requirement(inp, 31, 0).loans).toBeCloseTo(12_000 / 1.21 / 1.05, 6);
	});

	it('takes repayments out of outside money in the bridge years', () => {
		const inp: PlanInputs = {
			...base,
			outside: 2_000_000,
			age: 50,
			loans: [{ amountYear: 12_000, years: 4 }]
		};
		const r = runPlan(inp);
		expect(r.freeAge).toBe(50);
		expect(r.series[1].outside).toBe(2_000_000 - 30_000 - 12_000);
		expect(r.series[4].outside).toBe(2_000_000 - 4 * 42_000);
		// and stops when the loan is paid off
		expect(r.series[5].outside).toBe(r.series[4].outside - 30_000);
	});

	it('pays them from outside money once super is open, leaving super for spending', () => {
		const inp: PlanInputs = {
			...base,
			age: 60,
			accessAge: 60,
			outside: 36_000,
			super: 800_000,
			loans: [{ amountYear: 12_000, years: 3 }]
		};
		const r = runPlan(inp);
		expect(r.freeAge).toBe(60);
		expect(r.series[1]).toMatchObject({ outside: 24_000, super: 770_000 });
		expect(r.series[3]).toMatchObject({ outside: 0, super: 710_000 });
		expect(r.series[4]).toMatchObject({ outside: 0, super: 680_000 });
	});
});
