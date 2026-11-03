import { describe, expect, it } from 'vitest';
import { annuity, requirement, runPlan, type PlanInputs } from './model';

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
