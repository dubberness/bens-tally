import { describe, expect, it } from 'vitest';
import {
	SEED_PARAMS,
	defaultClass,
	normaliseParams,
	paramProblem,
	resolve,
	weeklyFromMonthly,
	type PlanAccount,
	type PlanContext
} from './params';

const acct = (id: number, kind: string, investable: boolean, valueCents: number): PlanAccount => ({
	id,
	name: `Account ${id}`,
	kind,
	investable,
	valueCents,
	asOf: '2030-01-01'
});

const ctx: PlanContext = {
	today: '2030-06-15',
	measuredSpending: { cents: 300_000, months: 12, from: '2029-06', to: '2030-05' },
	spendingIncludesOneOffs: false,
	measuredInvesting: { cents: 130_000, months: 3 },
	settingsBirthDate: '2000-06-16',
	accounts: [
		acct(1, 'cash', true, 10_000_00),
		acct(2, 'investment', true, 40_000_00),
		acct(3, 'super', false, 90_000_00),
		acct(4, 'cash', false, 5_000_00),
		acct(5, 'property', false, 500_000_00)
	]
};

describe('defaultClass', () => {
	it('puts super in super, investable accounts outside, the rest nowhere', () => {
		expect(defaultClass({ kind: 'super', investable: false })).toBe('super');
		expect(defaultClass({ kind: 'super', investable: true })).toBe('super');
		expect(defaultClass({ kind: 'cash', investable: true })).toBe('outside');
		expect(defaultClass({ kind: 'property', investable: false })).toBe('none');
	});
});

describe('normaliseParams', () => {
	it('fills gaps with the seed', () => {
		expect(normaliseParams(null)).toEqual(SEED_PARAMS);
		expect(normaliseParams({ returnPct: 5, withdrawalPct: 'x' })).toMatchObject({
			returnPct: 5,
			withdrawalPct: SEED_PARAMS.withdrawalPct
		});
	});
	it('keeps only known account classes', () => {
		const p = normaliseParams({ counted: { '4': 'outside', '5': 'bogus' } });
		expect(p.counted).toEqual({ '4': 'outside' });
	});
});

describe('paramProblem', () => {
	it('accepts the seed', () => expect(paramProblem(SEED_PARAMS)).toBeNull());
	it('rejects silly values', () => {
		expect(paramProblem({ ...SEED_PARAMS, withdrawalPct: 0 })).toMatch(/Withdrawal/);
		expect(paramProblem({ ...SEED_PARAMS, accessAge: 59.5 })).toMatch(/access age/);
		expect(paramProblem({ ...SEED_PARAMS, birthDate: '1/2/2000' })).toMatch(/Birth/);
		expect(paramProblem({ ...SEED_PARAMS, spendingCents: -1 })).toMatch(/Living/);
	});
});

describe('resolve', () => {
	it('uses measured spending and investing and the Settings birth date by default', () => {
		const r = resolve(SEED_PARAMS, ctx);
		expect(r.spendingSource).toBe('measured');
		expect(r.investingSource).toBe('measured');
		expect(r.birthSource).toBe('settings');
		expect(r.age).toBe(29);
		expect(r.investingCents).toBe(weeklyFromMonthly(130_000));
		expect(r.inputs?.spendYear).toBe(36_000);
		expect(r.inputs?.investYear).toBeCloseTo((weeklyFromMonthly(130_000) * 52) / 100, 6);
	});

	it('counts investable accounts outside and super apart, leaving the home out', () => {
		const r = resolve(SEED_PARAMS, ctx);
		expect(r.outsideCents).toBe(50_000_00);
		expect(r.superCents).toBe(90_000_00);
		expect(r.inputs?.outside).toBe(50_000);
	});

	it('lets a saved choice move an account', () => {
		const r = resolve({ ...SEED_PARAMS, counted: { '4': 'outside', '1': 'none' } }, ctx);
		expect(r.outsideCents).toBe(45_000_00);
	});

	it('prefers saved values over measured ones', () => {
		const r = resolve(
			{ ...SEED_PARAMS, spendingCents: 250_000, investingCents: 20_000, birthDate: '1990-01-01' },
			ctx
		);
		expect(r.spendingSource).toBe('saved');
		expect(r.investingSource).toBe('saved');
		expect(r.birthSource).toBe('scenario');
		expect(r.age).toBe(40);
		expect(r.inputs?.spendYear).toBe(30_000);
		expect(r.inputs?.investYear).toBe(10_400);
	});

	it('turns return and inflation into a real return', () => {
		const r = resolve({ ...SEED_PARAMS, returnPct: 7, inflationPct: 2.5 }, ctx);
		expect(r.inputs?.realReturn).toBeCloseTo(1.07 / 1.025 - 1, 12);
	});

	it('works out yearly super from salary, rate and contributions tax', () => {
		const r = resolve(
			{ ...SEED_PARAMS, salaryCents: 100_000_00, superRatePct: 10, superTaxPct: 15 },
			ctx
		);
		expect(r.inputs?.superYear).toBeCloseTo(8_500, 6);
	});

	it('counts no super contributions without a salary, and says so', () => {
		const r = resolve(SEED_PARAMS, ctx);
		expect(r.inputs?.superYear).toBe(0);
		expect(r.notes.join(' ')).toMatch(/salary/);
	});

	it('does not run without a birth date or any spending figure', () => {
		const r = resolve(SEED_PARAMS, { ...ctx, settingsBirthDate: null, measuredSpending: null });
		expect(r.inputs).toBeNull();
		expect(r.missing).toEqual(['your birth date', 'your living costs']);
	});

	it('tests the age on the birthday itself', () => {
		expect(resolve(SEED_PARAMS, { ...ctx, today: '2030-06-16' }).age).toBe(30);
	});
});
