import type { Action } from '$lib/budget/rules';

/** A transaction with what it counts as (null = not assigned yet). */
export interface SpendRow {
	id: string;
	amountCents: number;
	action: Action | null;
	budgetLineId: number | null;
	/** Whose it was, for "paid for someone else". */
	label?: string | null;
}

export interface PersonTotal {
	label: string;
	/** Paid out on their behalf (positive). */
	outCents: number;
	/** Money they sent in (positive). */
	inCents: number;
}

export interface SpendingSummary {
	/** Living spend: money out that is Ben's own, under the current rules and view. */
	spendingCents: number;
	incomeCents: number;
	repaymentsCents: number;
	investingCents: number;
	/** One-offs in the period, whether or not the view counts them. */
	oneOffCents: number;
	/** Money out nobody has assigned yet (already inside spendingCents). */
	unassignedOutCents: number;
	/** Money in nobody has assigned yet (not counted anywhere). */
	unassignedInCents: number;
	otherPeople: PersonTotal[];
	/** (income − spending − repayments) ÷ income, or null without income. */
	savingsRate: number | null;
	/** Per budget line: spend that counts toward living spend. */
	lineSpend: Map<number, number>;
	/** Per budget line: amounts assigned to it but kept out of spending (repayments, investing, one-offs). */
	lineKept: Map<number, number>;
}

export interface SpendingOptions {
	/** Count one-offs as spending (the one-off view). Off by default. */
	includeOneOffs?: boolean;
}

/** Fallback group name for "paid for someone else" without a label. */
export const NO_LABEL = 'Someone else';

const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/**
 * The spec's spending maths. Spending = money out, minus own transfers, minus
 * "paid for someone else", minus investing and repayments, minus one-offs while
 * the one-off view is off. Money in only counts against spending when it is
 * assigned to a budget line (a refund).
 */
export function summarise(rows: SpendRow[], opts: SpendingOptions = {}): SpendingSummary {
	let spending = 0;
	let income = 0;
	let repayments = 0;
	let investing = 0;
	let oneOff = 0;
	let unassignedOut = 0;
	let unassignedIn = 0;
	const people = new Map<string, PersonTotal>();
	const lineSpend = new Map<number, number>();
	const lineKept = new Map<number, number>();

	for (const r of rows) {
		const out = -r.amountCents; // positive when money left
		switch (r.action) {
			case 'transfer':
				break;
			case 'other_person': {
				const label = r.label?.trim() || NO_LABEL;
				const p = people.get(label) ?? { label, outCents: 0, inCents: 0 };
				if (r.amountCents < 0) p.outCents += out;
				else p.inCents += r.amountCents;
				people.set(label, p);
				break;
			}
			case 'income':
				income += r.amountCents;
				break;
			case 'repayment':
				repayments += out;
				if (r.budgetLineId != null) add(lineKept, r.budgetLineId, out);
				break;
			case 'investing':
				investing += out;
				if (r.budgetLineId != null) add(lineKept, r.budgetLineId, out);
				break;
			case 'one_off':
				oneOff += out;
				if (opts.includeOneOffs) {
					spending += out;
					if (r.budgetLineId != null) add(lineSpend, r.budgetLineId, out);
				} else if (r.budgetLineId != null) add(lineKept, r.budgetLineId, out);
				break;
			case 'budget':
				spending += out;
				if (r.budgetLineId != null) add(lineSpend, r.budgetLineId, out);
				break;
			default:
				if (r.amountCents < 0) {
					spending += out;
					unassignedOut += out;
				} else unassignedIn += r.amountCents;
		}
	}

	return {
		spendingCents: spending,
		incomeCents: income,
		repaymentsCents: repayments,
		investingCents: investing,
		oneOffCents: oneOff,
		unassignedOutCents: unassignedOut,
		unassignedInCents: unassignedIn,
		otherPeople: [...people.values()].sort((a, b) => b.outCents - a.outCents),
		savingsRate: income > 0 ? (income - spending - repayments) / income : null,
		lineSpend,
		lineKept
	};
}
