import { addMonths, monthsBetween, sameDayInMonth } from '$lib/time';

/*
 * Loan arithmetic. Pure functions on cents and local dates, so they are easy to test.
 * Rates are annual, in basis points (2.99% = 299). Interest is charged monthly at
 * rate ÷ 12 and each repayment is applied after that month's interest: the standard
 * schedule a lender's contract shows.
 */

/** An amortised loan: what a contract states. */
export interface AmortisedParams {
	principalCents: number;
	annualRateBp: number;
	repaymentCents: number;
	/** Date of the first repayment; later ones fall on the same day each month. */
	firstPaymentDate: string;
	/** Number of repayments; null or missing = until it's paid off. */
	payments?: number | null;
}

/** A share of another account's value, e.g. an equity-share lender's part of the home. */
export interface ShareOfParams {
	accountId: number;
	/** Basis points: 12.5% = 1250. */
	shareBp: number;
}

/**
 * Terms of a loan entered by hand (no calculation of its value), used only to say what
 * the next balance should be on the Close the month screen.
 */
export interface LoanTermsParams {
	annualRateBp: number;
	repaymentCents: number;
	/** Day of the month the repayment leaves; missing = the last day of the month. */
	paymentDay?: number | null;
}

export type CalculationKind = 'share_of' | 'amortised' | 'loan_terms';

const monthlyRate = (annualRateBp: number) => annualRateBp / 10_000 / 12;

/** Balance after k repayments of `repayment` on `principal` at monthly rate i. Never below 0. */
export function balanceAfter(principal: number, i: number, repayment: number, k: number): number {
	if (k <= 0) return principal;
	const value =
		i === 0
			? principal - repayment * k
			: principal * (1 + i) ** k - (repayment * ((1 + i) ** k - 1)) / i;
	return Math.max(0, Math.round(value));
}

const dayOf = (date: string) => Number(date.slice(8, 10));

/** How many scheduled repayments have happened on or before `date`. */
export function paymentsMade(p: AmortisedParams, date: string): number {
	if (date < p.firstPaymentDate) return 0;
	const first = p.firstPaymentDate.slice(0, 7);
	const month = date.slice(0, 7);
	const due = sameDayInMonth(month, dayOf(p.firstPaymentDate));
	let k = monthsBetween(first, month) + (date >= due ? 1 : 0);
	if (p.payments != null) k = Math.min(k, p.payments);
	return k;
}

/** Scheduled balance on a date. */
export function amortisedBalance(p: AmortisedParams, date: string): number {
	const k = paymentsMade(p, date);
	if (p.payments != null && k >= p.payments) return 0;
	return balanceAfter(p.principalCents, monthlyRate(p.annualRateBp), p.repaymentCents, k);
}

/** Repayment dates in (from, to], falling on `day` each month (clamped to short months). */
export function paymentDatesBetween(from: string, to: string, day: number): string[] {
	const out: string[] = [];
	if (to <= from) return out;
	const months = monthsBetween(from.slice(0, 7), to.slice(0, 7));
	for (let n = 0; n <= months; n++) {
		const d = sameDayInMonth(addMonths(from.slice(0, 7), n), day);
		if (d > from && d <= to) out.push(d);
	}
	return out;
}

/**
 * Carry a known balance forward to a later date: each repayment date in between adds a
 * month's interest and takes off one repayment. Used when a newer balance was entered by
 * hand (it replaces the schedule from then on) and for the expected mortgage balance.
 */
export function rollForward(
	balanceCents: number,
	from: string,
	to: string,
	annualRateBp: number,
	repaymentCents: number,
	day: number
): number {
	const k = paymentDatesBetween(from, to, day).length;
	return balanceAfter(balanceCents, monthlyRate(annualRateBp), repaymentCents, k);
}

/** The amortised balance, restarted from a newer known balance when there is one. */
export function amortisedFrom(
	p: AmortisedParams,
	date: string,
	known?: { date: string; valueCents: number } | null
): number {
	if (!known || known.date > date) return amortisedBalance(p, date);
	if (p.payments != null) {
		const lastDue = sameDayInMonth(
			addMonths(p.firstPaymentDate.slice(0, 7), p.payments - 1),
			dayOf(p.firstPaymentDate)
		);
		if (date >= lastDue) return 0;
	}
	return rollForward(
		known.valueCents,
		known.date,
		date,
		p.annualRateBp,
		p.repaymentCents,
		dayOf(p.firstPaymentDate)
	);
}

/** What a loan entered by hand should owe on `date`, from its last balance and its terms. */
export function expectedLoanBalance(
	last: { date: string; valueCents: number },
	terms: LoanTermsParams,
	date: string
): number {
	return rollForward(
		last.valueCents,
		last.date,
		date,
		terms.annualRateBp,
		terms.repaymentCents,
		terms.paymentDay ?? 31
	);
}

/** Share of a value in basis points, rounded to the cent. */
export function shareOf(valueCents: number, shareBp: number): number {
	return Math.round((valueCents * shareBp) / 10_000);
}
