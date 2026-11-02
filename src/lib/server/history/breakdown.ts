/*
 * The month change breakdown (spec "Calculations"). Pure: it takes each account's value
 * at the start and end of the period plus what was bought, and splits the change in net
 * worth into parts that always add up to it.
 */

export interface BreakdownInput {
	id: number;
	name: string;
	kind: string;
	side: string;
	/** A calculated share of a property account (an equity-share lender's part). */
	tiedToProperty?: boolean;
	/** The end value came from a balance marked as a re-estimate within the period. */
	reestimate?: boolean;
	/** Cents; null when the account had no value then (opened or closed in the period). */
	prev: number | null;
	curr: number | null;
}

export interface EstimateItem {
	accountId: number;
	name: string;
	cents: number;
}

export interface Breakdown {
	/** The month this change is measured against; null for the first month on record. */
	prevMonth: string | null;
	cash: number;
	bought: number;
	/** Where the bought figure came from: the sheet's own cost totals, or trades. */
	boughtSource: 'sheet' | 'trades';
	markets: number;
	super: number;
	debt: number;
	estimates: number;
	other: number;
	total: number;
	estimateItems: EstimateItem[];
}

export const PARTS = [
	{ key: 'cash', label: 'Saved to cash' },
	{ key: 'bought', label: 'Bought ETFs' },
	{ key: 'markets', label: 'ETF markets' },
	{ key: 'super', label: 'Super' },
	{ key: 'debt', label: 'Debt paid down' },
	{ key: 'other', label: 'Other' }
] as const;

/** Change in net worth from one account: assets add, liabilities (owed, positive) subtract. */
export function contribution(a: Pick<BreakdownInput, 'side' | 'prev' | 'curr'>): number {
	const sign = a.side === 'liability' ? -1 : 1;
	return sign * ((a.curr ?? 0) - (a.prev ?? 0));
}

export function isEstimate(a: Pick<BreakdownInput, 'kind' | 'tiedToProperty' | 'reestimate'>) {
	return a.kind === 'property' || !!a.tiedToProperty || !!a.reestimate;
}

export function computeBreakdown(
	accounts: BreakdownInput[],
	bought: number,
	boughtSource: Breakdown['boughtSource'] = 'trades',
	prevMonth: string | null = null
): Breakdown {
	const b: Breakdown = {
		prevMonth,
		cash: 0,
		bought,
		boughtSource,
		markets: 0,
		super: 0,
		debt: 0,
		estimates: 0,
		other: 0,
		total: 0,
		estimateItems: []
	};
	let invest = 0;
	for (const a of accounts) {
		const d = contribution(a);
		b.total += d;
		if (isEstimate(a)) {
			b.estimates += d;
			if (d !== 0) b.estimateItems.push({ accountId: a.id, name: a.name, cents: d });
		} else if (a.kind === 'cash' && a.side === 'asset') b.cash += d;
		else if (a.kind === 'investment' && a.side === 'asset') invest += d;
		else if (a.kind === 'super' && a.side === 'asset') b.super += d;
		else if (a.kind === 'loan' && a.side === 'liability') b.debt += d;
		else b.other += d;
	}
	b.markets = invest - bought;
	return b;
}

/** Everything except estimates: saving, investing, paying debt and markets. */
export const mine = (b: Pick<Breakdown, 'total' | 'estimates'>) => b.total - b.estimates;

/** The parts listed, in order, as [key, label, cents]. Zero "other" is left out. */
export function partRows(b: Breakdown) {
	return PARTS.filter((p) => p.key !== 'other' || b.other !== 0).map((p) => ({
		key: p.key,
		label: p.label,
		cents: b[p.key]
	}));
}
