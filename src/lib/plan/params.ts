import { ageOn } from '$lib/time';
import type { PlanInputs } from './model';

/**
 * The assumptions behind a scenario, and how they turn into model inputs.
 * The values in SEED_PARAMS are generic starting points that apply until Ben saves
 * his own; the model never reads them directly, only the resolved copy.
 */

export type AccountClass = 'outside' | 'super' | 'none';

export interface PlanParams {
	/** Living costs per month, cents. null follows the measured average from Up. */
	spendingCents: number | null;
	/** Investing per week, cents. null follows the measured average. */
	investingCents: number | null;
	/** Market return before inflation, percent a year. */
	returnPct: number;
	/** Percent a year. The model works in today's dollars on return after inflation. */
	inflationPct: number;
	/** Gross yearly salary, cents. null means super contributions are not counted. */
	salaryCents: number | null;
	/** Employer super, percent of salary. */
	superRatePct: number;
	/** Tax taken from contributions, percent. */
	superTaxPct: number;
	/** Safe withdrawal rate, percent. */
	withdrawalPct: number;
	/** Age super can be reached. */
	accessAge: number;
	/** 'YYYY-MM-DD'. null uses the birth date in Settings. */
	birthDate: string | null;
	/** Accounts moved from where they count by default; keyed by account id. */
	counted: Record<string, AccountClass>;
	/** Year the mortgage is gone, shown on the chart only. */
	mortgageGoneYear: number | null;
}

export const SEED_PARAMS: PlanParams = {
	spendingCents: null,
	investingCents: null,
	returnPct: 7,
	inflationPct: 2.5,
	salaryCents: null,
	superRatePct: 12,
	superTaxPct: 15,
	withdrawalPct: 4,
	accessAge: 60,
	birthDate: null,
	counted: {},
	mortgageGoneYear: null
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Read stored JSON back into params, filling anything missing with the seed. */
export function normaliseParams(raw: unknown): PlanParams {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const counted: Record<string, AccountClass> = {};
	if (r.counted && typeof r.counted === 'object') {
		for (const [k, v] of Object.entries(r.counted as Record<string, unknown>)) {
			if (v === 'outside' || v === 'super' || v === 'none') counted[k] = v;
		}
	}
	const seed = SEED_PARAMS;
	return {
		spendingCents: num(r.spendingCents),
		investingCents: num(r.investingCents),
		returnPct: num(r.returnPct) ?? seed.returnPct,
		inflationPct: num(r.inflationPct) ?? seed.inflationPct,
		salaryCents: num(r.salaryCents),
		superRatePct: num(r.superRatePct) ?? seed.superRatePct,
		superTaxPct: num(r.superTaxPct) ?? seed.superTaxPct,
		withdrawalPct: num(r.withdrawalPct) ?? seed.withdrawalPct,
		accessAge: num(r.accessAge) ?? seed.accessAge,
		birthDate: typeof r.birthDate === 'string' && r.birthDate ? r.birthDate : null,
		counted,
		mortgageGoneYear: num(r.mortgageGoneYear)
	};
}

/** Why a set of params can't be saved, or null. */
export function paramProblem(p: PlanParams): string | null {
	const within = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
	if (p.spendingCents !== null && p.spendingCents < 0) return 'Living costs cannot be negative';
	if (p.investingCents !== null && p.investingCents < 0) return 'Investing cannot be negative';
	if (!within(p.returnPct, -10, 30)) return 'Return should be between −10% and 30%';
	if (!within(p.inflationPct, -5, 30)) return 'Inflation should be between −5% and 30%';
	if (p.salaryCents !== null && p.salaryCents < 0) return 'Salary cannot be negative';
	if (!within(p.superRatePct, 0, 100)) return 'Super rate should be between 0% and 100%';
	if (!within(p.superTaxPct, 0, 100)) return 'Contributions tax should be between 0% and 100%';
	if (!within(p.withdrawalPct, 0.1, 20)) return 'Withdrawal rate should be between 0.1% and 20%';
	if (!Number.isInteger(p.accessAge) || !within(p.accessAge, 30, 100))
		return 'Super access age should be a whole number between 30 and 100';
	if (p.birthDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate))
		return 'Birth date should look like 1990-12-31';
	if (p.mortgageGoneYear !== null && !within(p.mortgageGoneYear, 1900, 2200))
		return 'Mortgage-gone year should be a four-digit year';
	return null;
}

export interface PlanAccount {
	id: number;
	name: string;
	kind: string;
	investable: boolean;
	valueCents: number;
	asOf: string | null;
}

/** Everything the model reads from outside the scenario. */
export interface PlanContext {
	today: string;
	/** Average living costs per month over recent months, cents. */
	measuredSpending: { cents: number; months: number; from: string; to: string } | null;
	/** Whether that average counts one-off spending (a Budget setting). */
	spendingIncludesOneOffs: boolean;
	/** Average investing per month over recent months, cents. */
	measuredInvesting: { cents: number; months: number } | null;
	/** Birth date saved in Settings. */
	settingsBirthDate: string | null;
	accounts: PlanAccount[];
}

/** Where an account counts unless the scenario says otherwise. */
export function defaultClass(a: Pick<PlanAccount, 'kind' | 'investable'>): AccountClass {
	return a.kind === 'super' ? 'super' : a.investable ? 'outside' : 'none';
}

export const classOf = (a: PlanAccount, p: PlanParams): AccountClass =>
	p.counted[String(a.id)] ?? defaultClass(a);

/** Weekly cents from a monthly figure. */
export const weeklyFromMonthly = (monthly: number) => Math.round((monthly * 12) / 52);

export interface Resolved {
	/** Null when the model can't run yet (see `missing`). */
	inputs: PlanInputs | null;
	/** Blocking gaps, e.g. no birth date. */
	missing: string[];
	/** Things worth knowing that don't stop the model. */
	notes: string[];
	birthDate: string | null;
	birthSource: 'scenario' | 'settings' | null;
	age: number | null;
	spendingCents: number | null;
	spendingSource: 'saved' | 'measured' | null;
	investingCents: number | null;
	investingSource: 'saved' | 'measured' | null;
	realReturn: number;
	outsideCents: number;
	superCents: number;
	accounts: (PlanAccount & { cls: AccountClass; defaultCls: AccountClass })[];
}

export function resolve(p: PlanParams, ctx: PlanContext): Resolved {
	const missing: string[] = [];
	const notes: string[] = [];

	const birthDate = p.birthDate ?? ctx.settingsBirthDate;
	const birthSource = p.birthDate ? 'scenario' : ctx.settingsBirthDate ? 'settings' : null;
	const age = birthDate ? ageOn(birthDate, ctx.today) : null;
	if (age === null) missing.push('your birth date');

	const spendingCents = p.spendingCents ?? ctx.measuredSpending?.cents ?? null;
	const spendingSource =
		p.spendingCents !== null ? 'saved' : spendingCents !== null ? 'measured' : null;
	if (spendingCents === null) missing.push('your living costs');

	const measuredWeekly = ctx.measuredInvesting
		? weeklyFromMonthly(ctx.measuredInvesting.cents)
		: null;
	const investingCents = p.investingCents ?? measuredWeekly;
	const investingSource =
		p.investingCents !== null ? 'saved' : investingCents !== null ? 'measured' : null;
	if (investingCents === null) notes.push('No investing found yet, so none is counted.');

	if (p.salaryCents === null)
		notes.push('No salary entered, so super contributions are not counted.');

	const accounts = ctx.accounts.map((a) => ({
		...a,
		cls: classOf(a, p),
		defaultCls: defaultClass(a)
	}));
	const sum = (cls: AccountClass) =>
		accounts.filter((a) => a.cls === cls).reduce((s, a) => s + a.valueCents, 0);
	const outsideCents = sum('outside');
	const superCents = sum('super');

	const realReturn = (1 + p.returnPct / 100) / (1 + p.inflationPct / 100) - 1;
	const salary = (p.salaryCents ?? 0) / 100;

	let inputs: PlanInputs | null = null;
	if (!missing.length && age !== null && spendingCents !== null) {
		inputs = {
			age,
			year: Number(ctx.today.slice(0, 4)),
			outside: outsideCents / 100,
			super: superCents / 100,
			spendYear: (spendingCents * 12) / 100,
			investYear: ((investingCents ?? 0) * 52) / 100,
			superYear: salary * (p.superRatePct / 100) * (1 - p.superTaxPct / 100),
			realReturn,
			withdrawal: p.withdrawalPct / 100,
			accessAge: p.accessAge,
			endAge: Math.max(p.accessAge, age) + 5
		};
	}

	return {
		inputs,
		missing,
		notes,
		birthDate,
		birthSource,
		age,
		spendingCents,
		spendingSource,
		investingCents,
		investingSource,
		realReturn,
		outsideCents,
		superCents,
		accounts
	};
}

/** The same assumptions always give the same text, so two sets can be compared. */
export function canonical(p: PlanParams): string {
	const counted = Object.fromEntries(
		Object.entries(p.counted).sort(([a], [b]) => a.localeCompare(b))
	);
	return JSON.stringify({ ...p, counted }, Object.keys(p).sort().concat(Object.keys(counted)));
}
