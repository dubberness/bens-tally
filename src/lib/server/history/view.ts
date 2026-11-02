import { and, asc, eq, gte } from 'drizzle-orm';
import { formatMoney } from '$lib/money';
import { localDate, shortDate } from '$lib/time';
import { db, schema } from '../db';
import type { Account, AccountValue } from '../ledger/value';
import { getCalculation } from './calculated';
import type { AmortisedParams, LoanTermsParams, ShareOfParams } from './schedule';
import type { Breakdown } from './breakdown';

/* Small helpers that turn records into what the screens show. */

export const KIND_LABEL: Record<string, string> = {
	cash: 'Cash',
	investment: 'Investments',
	super: 'Super',
	property: 'Property',
	loan: 'Loan',
	other: 'Other'
};

const KIND_COLOUR: Record<string, string> = {
	cash: 'var(--c-cash)',
	investment: 'var(--c-etf)',
	super: 'var(--c-super)',
	property: 'var(--c-home)',
	other: '#9aa3b5'
};
const DEBT_COLOURS = ['var(--c-debt-1)', 'var(--c-debt-2)', 'var(--c-debt-3)'];

/** An account's colour: its own, or one for its kind (liabilities take debt shades in turn). */
export function colourFor(a: Account, debtIndex = 0): string {
	if (a.colour) return a.colour;
	if (a.side === 'liability') return DEBT_COLOURS[Math.min(debtIndex, DEBT_COLOURS.length - 1)];
	return KIND_COLOUR[a.kind] ?? KIND_COLOUR.other;
}

/** Source badge: Live, Email · 28 Oct, You · 31 Oct, Estimate, Calculated. */
export function badgeText(v: AccountValue | null | undefined): string {
	if (!v) return 'No value yet';
	switch (v.badge) {
		case 'live':
			return 'Live';
		case 'email':
			return `Email · ${shortDate(v.asOf)}`;
		case 'manual':
			return `You · ${shortDate(v.asOf)}`;
		case 'estimate':
			return 'Estimate';
		case 'calculated':
			return 'Calculated';
		case 'sheet':
			return `Sheet · ${shortDate(v.asOf)}`;
		case 'month_end':
			return `Month end · ${shortDate(v.asOf)}`;
	}
}

const pct = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;

/** One line under an account's name: how its value is worked out, or its note. */
export function detailFor(a: Account, names: Map<number, string>): string {
	const calc = getCalculation(a.id);
	if (calc?.kind === 'share_of') {
		const p = calc.params as ShareOfParams;
		return `${pct(p.shareBp)} of ${names.get(p.accountId) ?? 'another account'}`;
	}
	if (calc?.kind === 'amortised') {
		const p = calc.params as AmortisedParams;
		return `${pct(p.annualRateBp)} · ${formatMoney(p.repaymentCents, { cents: p.repaymentCents % 100 !== 0 })} a month`;
	}
	if (calc?.kind === 'loan_terms') {
		const p = calc.params as LoanTermsParams;
		return `${pct(p.annualRateBp)} · ${formatMoney(p.repaymentCents)} a month`;
	}
	if (a.note) return a.note.split('\n')[0];
	return KIND_LABEL[a.kind] ?? a.kind;
}

/** Upcoming "Coming up" items. */
export function upcomingEvents(limit = 3, today = localDate()) {
	return db
		.select()
		.from(schema.events)
		.where(and(gte(schema.events.date, today), eq(schema.events.dismissed, false)))
		.orderBy(asc(schema.events.date), asc(schema.events.id))
		.limit(limit)
		.all();
}

/** The parts of a breakdown, as screens show them. */
export function breakdownView(b: Breakdown | null) {
	if (!b) return null;
	return {
		total: b.total,
		mine: b.total - b.estimates,
		estimates: b.estimates,
		parts: [
			{ key: 'cash', label: 'Saved to cash', cents: b.cash },
			{ key: 'bought', label: 'Bought ETFs', cents: b.bought },
			{ key: 'markets', label: 'ETF markets', cents: b.markets },
			{ key: 'super', label: 'Super', cents: b.super },
			{ key: 'debt', label: 'Debt paid down', cents: b.debt },
			...(b.other ? [{ key: 'other', label: 'Other', cents: b.other }] : [])
		],
		estimateItems: b.estimateItems
	};
}
export type BreakdownView = NonNullable<ReturnType<typeof breakdownView>>;
