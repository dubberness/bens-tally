/**
 * The bridge model: when work becomes optional.
 *
 * Everything is in today's dollars and steps a year at a time from today. O is money
 * outside super, S is super, r the real return, E yearly spending, w the safe
 * withdrawal rate and P the age super can be reached. Work becomes optional at the
 * first age A where
 *
 *   O_A >= bridge(A) + loans(A) + shortfall(A)
 *
 * bridge(A) is what O must hold at A to pay E every year until P (a level annuity at
 * r). loans(A) is what O must hold at A to keep paying the loan repayments still due
 * after A, whether they end before P or run past it. shortfall(A) is what O must add
 * because super will not be enough on its own at P: super stops getting contributions
 * at A and grows at r to P, and it must reach E / w by then; the gap is brought back
 * to A at r.
 *
 * Loan repayments: E leaves out loan repayments, because while work continues they come out
 * of pay and nothing changes before A. After A they are still owed until each loan is
 * paid off. A repayment is a fixed nominal amount, so in today's dollars it shrinks by
 * inflation every year: the repayment in year j from now is amount / (1 + inflation)^j.
 * A loan with `years` left pays for that many years, the last one part of a year.
 * Repayments are paid at each year's end like spending, from O; after P they come from
 * O while it lasts (loans(A) reserved it for them) and from S once it is empty.
 *
 * Before A, O grows by investing and S by super contributions. After A, O pays for
 * spending until P, then S does. The home itself and the debts it carries are left out
 * as a pair; only the repayments above are modelled. Age Pension is future work.
 *
 * Plain numbers in, plain numbers out, so it runs on the server and in the browser.
 */

export interface PlanInputs {
	/** Whole years lived today. */
	age: number;
	/** Calendar year today. */
	year: number;
	/** Money outside super today, in dollars. */
	outside: number;
	/** Super today, in dollars. */
	super: number;
	/** Yearly spending, dollars. */
	spendYear: number;
	/** Yearly investing outside super, dollars. */
	investYear: number;
	/** Yearly super contributions after contributions tax, dollars. */
	superYear: number;
	/** Return after inflation, a fraction (0.045 = 4.5%). */
	realReturn: number;
	/** Safe withdrawal rate, a fraction. */
	withdrawal: number;
	/** Age super can be reached. */
	accessAge: number;
	/** Last age drawn on the chart. */
	endAge: number;
	/** Inflation, a fraction. Repayments are fixed dollars, so they shrink by this. Default 0. */
	inflation?: number;
	/** Loan repayments that carry on after work stops. None by default. */
	loans?: LoanRepayments[];
}

/** One loan's repayments, from today until it is paid off. */
export interface LoanRepayments {
	/** Repaid each year, in dollars (not adjusted for inflation: today's amount). */
	amountYear: number;
	/** Years of repayments left from today; the last year can be a part. */
	years: number;
}

export type Phase = 'build' | 'bridge' | 'super';

export interface PlanPoint {
	age: number;
	year: number;
	outside: number;
	super: number;
	phase: Phase;
}

export interface PlanResult {
	/** First age work is optional, or null when not before the access age. */
	freeAge: number | null;
	freeYear: number | null;
	yearsAway: number | null;
	/** At the free age: what the bridge needs, what super is short by, and what O holds. */
	atFree: {
		bridge: number;
		loans: number;
		shortfall: number;
		outside: number;
		super: number;
	} | null;
	series: PlanPoint[];
}

/** Present value of `years` yearly payments of `amount`, paid at each year's end. */
export function annuity(amount: number, rate: number, years: number): number {
	if (years <= 0) return 0;
	if (Math.abs(rate) < 1e-12) return amount * years;
	return (amount * (1 - Math.pow(1 + rate, -years))) / rate;
}

/**
 * Loan repayments paid in the j-th year from today (j = 1 is the next twelve months),
 * in today's dollars: a fixed nominal amount shrunk by inflation.
 */
export function loanPayment(inp: PlanInputs, j: number): number {
	const infl = inp.inflation ?? 0;
	let total = 0;
	for (const l of inp.loans ?? []) {
		const share = Math.min(1, Math.max(0, l.years - (j - 1)));
		if (share > 0) total += (l.amountYear * share) / Math.pow(1 + infl, j);
	}
	return total;
}

/** Years from today of the longest-running loan. */
const loanYears = (inp: PlanInputs) =>
	Math.ceil(Math.max(0, ...(inp.loans ?? []).map((l) => l.years)));

/** Value at `age` of the repayments still due after it, discounted at the real return. */
function loanPresentValue(inp: PlanInputs, age: number): number {
	const r = inp.realReturn;
	const now = age - inp.age;
	let pv = 0;
	for (let j = now + 1; j <= loanYears(inp); j++)
		pv += loanPayment(inp, j) / Math.pow(1 + r, j - now);
	return pv;
}

/** What outside-super money must be at `age` for work to be optional. */
export function requirement(inp: PlanInputs, age: number, superNow: number) {
	const r = inp.realReturn;
	const n = Math.max(0, inp.accessAge - age);
	const growth = Math.pow(1 + r, n);
	const bridge = annuity(inp.spendYear, r, n);
	const loans = loanPresentValue(inp, age);
	const target = inp.withdrawal > 0 ? inp.spendYear / inp.withdrawal : Infinity;
	const shortfall = Math.max(0, target - superNow * growth) / growth;
	return { bridge, loans, shortfall, total: bridge + loans + shortfall };
}

export function runPlan(inp: PlanInputs): PlanResult {
	const r = inp.realReturn;
	const last = Math.max(inp.accessAge, inp.age);
	let O = inp.outside;
	let S = inp.super;
	let freeAge: number | null = null;
	let atFree: PlanResult['atFree'] = null;

	for (let age = inp.age; age <= last; age++) {
		const need = requirement(inp, age, S);
		if (O >= need.total - 1e-6) {
			freeAge = age;
			atFree = {
				bridge: need.bridge,
				loans: need.loans,
				shortfall: need.shortfall,
				outside: O,
				super: S
			};
			break;
		}
		O = O * (1 + r) + inp.investYear;
		S = S * (1 + r) + inp.superYear;
	}

	O = inp.outside;
	S = inp.super;
	const series: PlanPoint[] = [];
	const end = Math.max(inp.endAge, inp.age + 1);
	for (let age = inp.age; age <= end; age++) {
		const working = freeAge === null || age < freeAge;
		const phase: Phase = working ? 'build' : age < inp.accessAge ? 'bridge' : 'super';
		series.push({
			age,
			year: inp.year + (age - inp.age),
			outside: Math.max(0, O),
			super: Math.max(0, S),
			phase
		});
		if (working) {
			O = O * (1 + r) + inp.investYear;
			S = S * (1 + r) + inp.superYear;
		} else if (age < inp.accessAge) {
			O = O * (1 + r) - inp.spendYear - loanPayment(inp, age - inp.age + 1);
			S = S * (1 + r);
		} else {
			// Repayments come from outside money while there is any, then from super.
			O = O * (1 + r);
			S = S * (1 + r) - inp.spendYear;
			const owed = loanPayment(inp, age - inp.age + 1);
			const fromO = Math.min(owed, Math.max(0, O));
			O -= fromO;
			S -= owed - fromO;
		}
	}

	return {
		freeAge,
		freeYear: freeAge === null ? null : inp.year + (freeAge - inp.age),
		yearsAway: freeAge === null ? null : freeAge - inp.age,
		atFree,
		series
	};
}
