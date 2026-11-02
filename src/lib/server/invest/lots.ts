/*
 * Parcels: each buy is a parcel; each sell uses up the oldest parcels first (FIFO), the
 * way the sheet does it. Pure functions so holdings and capital gains share one answer.
 */

export interface LotTrade {
	id?: number;
	date: string;
	side: 'buy' | 'sell';
	unitsE6: number;
	valueCents: number;
	feeCents: number;
}

/** What's left of a buy. Cost includes its share of the fee. */
export interface Parcel {
	tradeId?: number;
	date: string;
	unitsE6: number;
	costCents: number;
}

/** Part of a sell matched to one parcel. */
export interface Disposal {
	sellTradeId?: number;
	date: string;
	boughtOn: string;
	unitsE6: number;
	costCents: number;
	proceedsCents: number;
	gainCents: number;
}

export interface LotResult {
	parcels: Parcel[];
	disposals: Disposal[];
	/** Units sold that no parcel covered (a missing buy); kept so a check can say so. */
	oversoldE6: number;
}

/** Same-day buys go before sells so a buy-then-sell day doesn't look oversold. */
export function tradeOrder(a: LotTrade, b: LotTrade): number {
	if (a.date !== b.date) return a.date < b.date ? -1 : 1;
	if (a.side !== b.side) return a.side === 'buy' ? -1 : 1;
	return (a.id ?? 0) - (b.id ?? 0);
}

/** Part of an amount for part of the units, rounded to the cent. */
const part = (amount: number, units: number, of: number) =>
	of === 0 ? 0 : Math.round((amount * units) / of);

/** Match one instrument's trades, FIFO. Trades on or before `upTo` only, when given. */
export function matchFifo(trades: LotTrade[], upTo?: string): LotResult {
	const parcels: Parcel[] = [];
	const disposals: Disposal[] = [];
	let oversoldE6 = 0;
	const sorted = trades.filter((t) => !upTo || t.date <= upTo).sort(tradeOrder);

	for (const t of sorted) {
		if (t.side === 'buy') {
			parcels.push({
				tradeId: t.id,
				date: t.date,
				unitsE6: t.unitsE6,
				costCents: t.valueCents + t.feeCents
			});
			continue;
		}
		const totalProceeds = t.valueCents - t.feeCents;
		let left = t.unitsE6;
		let proceedsLeft = totalProceeds;
		while (left > 0 && parcels.length) {
			const p = parcels[0];
			const units = Math.min(left, p.unitsE6);
			const cost = units === p.unitsE6 ? p.costCents : part(p.costCents, units, p.unitsE6);
			const proceeds = units === left ? proceedsLeft : part(totalProceeds, units, t.unitsE6);
			disposals.push({
				sellTradeId: t.id,
				date: t.date,
				boughtOn: p.date,
				unitsE6: units,
				costCents: cost,
				proceedsCents: proceeds,
				gainCents: proceeds - cost
			});
			p.unitsE6 -= units;
			p.costCents -= cost;
			if (p.unitsE6 === 0) parcels.shift();
			left -= units;
			proceedsLeft -= proceeds;
		}
		oversoldE6 += left;
	}
	return { parcels, disposals, oversoldE6 };
}
