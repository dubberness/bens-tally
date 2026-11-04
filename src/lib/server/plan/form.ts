import { parseMoney } from '$lib/money';
import {
	defaultClass,
	type AccountClass,
	type PlanAccount,
	type PlanLoan,
	type PlanParams
} from '$lib/plan/params';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function dollars(f: FormData, k: string, label: string): number | null | string {
	const raw = text(f, k);
	if (!raw) return null;
	const c = parseMoney(raw);
	return c == null ? `${label} should be plain dollars, like 2500 or 62.50` : c;
}

function number(f: FormData, k: string, label: string): number | null | string {
	const raw = text(f, k).replace(/[%,\s]/g, '');
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : `${label} should be a number`;
}

/** Read the Plan form into params, or say what is wrong. */
export function paramsFromForm(
	f: FormData,
	accounts: PlanAccount[],
	loans: Pick<PlanLoan, 'id'>[] = []
): PlanParams | string {
	const bad = (v: unknown): v is string => typeof v === 'string';

	const spending = dollars(f, 'spending', 'Living costs');
	if (bad(spending)) return spending;
	const investing = dollars(f, 'investing', 'Investing');
	if (bad(investing)) return investing;
	const salary = dollars(f, 'salary', 'Salary');
	if (bad(salary)) return salary;

	const pct = (k: string, label: string) => number(f, k, label);
	const ret = pct('returnPct', 'Return');
	const inf = pct('inflationPct', 'Inflation');
	const rate = pct('superRatePct', 'Super rate');
	const tax = pct('superTaxPct', 'Contributions tax');
	const wd = pct('withdrawalPct', 'Withdrawal rate');
	const age = number(f, 'accessAge', 'Super access age');
	const year = number(f, 'mortgageGoneYear', 'Loan payoff year');
	for (const v of [ret, inf, rate, tax, wd, age, year]) if (bad(v)) return v;
	if (ret === null || inf === null || rate === null || tax === null || wd === null || age === null)
		return 'Fill in every assumption except salary, birth date and the loan payoff year';

	const counted: Record<string, AccountClass> = {};
	for (const a of accounts) {
		const v = text(f, `count_${a.id}`);
		if ((v === 'outside' || v === 'super' || v === 'none') && v !== defaultClass(a))
			counted[String(a.id)] = v;
	}

	// A ticked loan sends a field; an unticked one sends nothing.
	const loansOff = loans.filter((l) => !f.get(`loan_${l.id}`)).map((l) => String(l.id));

	// "Follow" means: keep using the measured average instead of a saved number.
	return {
		spendingCents: f.get('spendingFollow') ? null : spending,
		investingCents: f.get('investingFollow') ? null : investing,
		returnPct: ret as number,
		inflationPct: inf as number,
		salaryCents: salary,
		superRatePct: rate as number,
		superTaxPct: tax as number,
		withdrawalPct: wd as number,
		accessAge: age as number,
		birthDate: text(f, 'birthDate') || null,
		counted,
		mortgageGoneYear: year as number | null,
		loansOff
	};
}
