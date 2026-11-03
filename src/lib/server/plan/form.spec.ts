import { describe, expect, it } from 'vitest';
import { paramsFromForm } from './form';
import { SEED_PARAMS, type PlanAccount } from '$lib/plan/params';

const accounts: PlanAccount[] = [
	{ id: 1, name: 'A', kind: 'cash', investable: true, valueCents: 0, asOf: null },
	{ id: 2, name: 'B', kind: 'super', investable: false, valueCents: 0, asOf: null },
	{ id: 3, name: 'C', kind: 'cash', investable: false, valueCents: 0, asOf: null }
];

function form(over: Record<string, string> = {}) {
	const f = new FormData();
	const base: Record<string, string> = {
		spending: '2,500',
		investing: '150',
		returnPct: '7',
		inflationPct: '2.5',
		salary: '',
		superRatePct: '12',
		superTaxPct: '15',
		withdrawalPct: '4',
		accessAge: '60',
		birthDate: '',
		mortgageGoneYear: '',
		count_1: 'outside',
		count_2: 'super',
		count_3: 'none'
	};
	for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== '__omit') f.set(k, v);
	return f;
}

describe('paramsFromForm', () => {
	it('reads dollars into cents and leaves blanks empty', () => {
		const p = paramsFromForm(form(), accounts);
		expect(p).toMatchObject({
			spendingCents: 250_000,
			investingCents: 15_000,
			salaryCents: null,
			birthDate: null,
			mortgageGoneYear: null,
			returnPct: 7,
			accessAge: 60
		});
		expect(p).toMatchObject({ counted: {} });
	});

	it('follows the measured figures when asked', () => {
		const p = paramsFromForm(form({ spendingFollow: 'on', investingFollow: 'on' }), accounts);
		expect(p).toMatchObject({ spendingCents: null, investingCents: null });
	});

	it('stores only the accounts moved from their usual place', () => {
		const p = paramsFromForm(form({ count_1: 'none', count_3: 'outside' }), accounts);
		expect(p).toMatchObject({ counted: { '1': 'none', '3': 'outside' } });
	});

	it('reads salary, birth date and the mortgage year when given', () => {
		const p = paramsFromForm(
			form({ salary: '80000', birthDate: '1990-01-02', mortgageGoneYear: '2040' }),
			accounts
		);
		expect(p).toMatchObject({
			salaryCents: 8_000_000,
			birthDate: '1990-01-02',
			mortgageGoneYear: 2040
		});
	});

	it('says what is wrong', () => {
		expect(paramsFromForm(form({ spending: 'lots' }), accounts)).toMatch(/Living costs/);
		expect(paramsFromForm(form({ returnPct: 'x' }), accounts)).toMatch(/Return/);
		expect(paramsFromForm(form({ withdrawalPct: '' }), accounts)).toMatch(/Fill in every/);
	});

	it('round-trips the seed shape', () => {
		const p = paramsFromForm(form(), accounts) as typeof SEED_PARAMS;
		expect(Object.keys(p).sort()).toEqual(Object.keys(SEED_PARAMS).sort());
	});
});
