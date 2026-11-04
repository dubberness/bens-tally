import { asc, eq, isNull, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { accountValue } from '../ledger/value';
import {
	expectedLoanBalance,
	monthsToPayoff,
	paymentsMade,
	type AmortisedParams,
	type LoanTermsParams
} from '../history/schedule';
import type { PlanLoan } from '$lib/plan/params';

/**
 * Open loans that are repaid by regular repayments: those with loan terms or an
 * amortised schedule. A share of the home (an equity share) is not repaid monthly, so
 * it has no calculation of either kind and never appears. Biggest balance first.
 */
export function planLoans(today: string): PlanLoan[] {
	const rows = db
		.select({ account: schema.accounts, calc: schema.calculations })
		.from(schema.accounts)
		.innerJoin(schema.calculations, eq(schema.calculations.accountId, schema.accounts.id))
		.where(and(eq(schema.accounts.side, 'liability'), isNull(schema.accounts.closedOn)))
		.orderBy(asc(schema.accounts.sortOrder), asc(schema.accounts.name))
		.all();

	const out: PlanLoan[] = [];
	for (const { account, calc } of rows) {
		const v = accountValue(account, today);
		if (!v) continue;
		let balanceCents = v.valueCents;
		let repaymentCents: number;
		let annualRateBp: number;
		let paymentsLeft: number | null = null;
		if (calc.kind === 'loan_terms') {
			const p = calc.params as LoanTermsParams;
			if (!p?.repaymentCents) continue;
			// A hand-entered balance is carried forward by the repayments made since.
			balanceCents = expectedLoanBalance({ date: v.asOf, valueCents: v.valueCents }, p, today);
			repaymentCents = p.repaymentCents;
			annualRateBp = p.annualRateBp;
		} else if (calc.kind === 'amortised') {
			const p = calc.params as AmortisedParams;
			if (!p?.firstPaymentDate || !p.repaymentCents) continue;
			repaymentCents = p.repaymentCents;
			annualRateBp = p.annualRateBp;
			if (p.payments != null) paymentsLeft = Math.max(0, p.payments - paymentsMade(p, today));
		} else continue;
		if (balanceCents <= 0) continue;

		let monthsLeft = monthsToPayoff(balanceCents, annualRateBp, repaymentCents);
		// A contract that fixes the number of repayments ends then, whatever the balance says.
		if (paymentsLeft !== null) monthsLeft = Math.min(monthsLeft ?? paymentsLeft, paymentsLeft);
		out.push({
			id: account.id,
			name: account.name,
			balanceCents,
			asOf: v.asOf,
			repaymentCents,
			monthsLeft
		});
	}
	return out.sort((a, b) => b.balanceCents - a.balanceCents || a.id - b.id);
}
