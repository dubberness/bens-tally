/*
 * Is an incoming trade (a CSV row, later an email) one the app already has? Pure, so
 * the rules can be tested alone.
 *
 * - Same order ID: the same trade. If the numbers differ, Ben decides.
 * - No order ID on the app's copy (the sheet never had one): same fund and side,
 *   units within a ten-thousandth, dated within a few days. Same day and value means
 *   it's the same trade and just gains the order ID; otherwise Ben decides.
 * - Nothing close: a new trade.
 */

export interface KnownTrade {
	id: number;
	orderId: string | null;
	ticker: string;
	date: string;
	side: string;
	unitsE6: number;
	priceE4: number;
	valueCents: number;
	feeCents: number;
}

export interface IncomingTrade {
	orderId: string | null;
	ticker: string;
	date: string;
	side: 'buy' | 'sell';
	unitsE6: number;
	priceE4: number;
	valueCents: number;
	feeCents: number;
}

export type TradeMatch =
	| { kind: 'new' }
	| { kind: 'same'; id: number }
	| { kind: 'link'; id: number }
	| { kind: 'differs'; id: number; fields: DiffField[] };

export type DiffField = 'date' | 'units' | 'value' | 'fee' | 'price';

/** Sheet units are typed to four places; CSVs can carry six. */
export const UNITS_SLACK_E6 = 100;
/** Rounding between units × price and the broker's value. */
export const VALUE_SLACK_CENTS = 5;
/** A price typed to the cent against an average fill price. */
export const PRICE_SLACK = 0.002;
/** An order date in the sheet against a fill date in the file. */
export const DATE_SLACK_DAYS = 4;

const days = (a: string, b: string) =>
	Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

export function differences(known: KnownTrade, t: IncomingTrade): DiffField[] {
	const out: DiffField[] = [];
	if (known.date !== t.date) out.push('date');
	if (Math.abs(known.unitsE6 - t.unitsE6) > UNITS_SLACK_E6) out.push('units');
	if (Math.abs(known.valueCents - t.valueCents) > VALUE_SLACK_CENTS) out.push('value');
	if (known.feeCents !== t.feeCents) out.push('fee');
	// Price only counts when it's the only thing off, and by more than rounding: the sheet
	// typed prices to the cent, the broker gives an average to four places.
	if (!out.length && Math.abs(known.priceE4 - t.priceE4) > Math.max(1, known.priceE4 * PRICE_SLACK))
		out.push('price');
	return out;
}

/**
 * `taken` holds ids already matched in this batch, so two identical rows don't both
 * land on one trade. The caller adds the returned id to it.
 */
export function matchTrade(
	t: IncomingTrade,
	known: KnownTrade[],
	taken: Set<number> = new Set()
): TradeMatch {
	if (t.orderId) {
		const same = known.find((k) => k.orderId === t.orderId);
		if (same) {
			const fields = differences(same, t);
			return fields.length
				? { kind: 'differs', id: same.id, fields }
				: { kind: 'same', id: same.id };
		}
	}
	const close = known
		.filter(
			(k) =>
				!taken.has(k.id) &&
				(!k.orderId || !t.orderId) &&
				k.ticker === t.ticker &&
				k.side === t.side &&
				Math.abs(k.unitsE6 - t.unitsE6) <= UNITS_SLACK_E6 &&
				days(k.date, t.date) <= DATE_SLACK_DAYS
		)
		.sort((a, b) => days(a.date, t.date) - days(b.date, t.date));
	const best = close[0];
	if (!best) return { kind: 'new' };
	const fields = differences(best, t);
	if (fields.length) return { kind: 'differs', id: best.id, fields };
	return t.orderId && !best.orderId ? { kind: 'link', id: best.id } : { kind: 'same', id: best.id };
}
