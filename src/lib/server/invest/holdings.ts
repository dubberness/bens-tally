import { and, asc, desc, eq, lte } from 'drizzle-orm';
import { localDate } from '$lib/time';
import { db, schema } from '../db';
import { getSetting } from '../settings';
import { matchLots, openUnits, type LotMethod, type LotResult, type LotTrade } from './lots';

export type Instrument = typeof schema.instruments.$inferSelect;

export const LOT_METHOD_KEY = 'invest.lot_method';
/** How sells are matched to parcels; FIFO unless Ben picks another in Manage › Tax rules. */
export const lotMethod = (): LotMethod => getSetting<LotMethod>(LOT_METHOD_KEY) ?? 'fifo';

export interface Price {
	priceE4: number;
	date: string;
	/** yahoo | sheet_csv | manual | email | trade */
	source: string;
}

/**
 * Price of an instrument on a date (null = now): the manual price while it's set (for
 * today only), else the latest stored price on or before the date, else the latest
 * trade's fill price as a last resort.
 */
export function priceOn(instrument: Instrument, date: string | null): Price | null {
	const today = localDate();
	const on = date ?? today;
	if (instrument.manualPriceE4 != null && on >= today)
		return { priceE4: instrument.manualPriceE4, date: today, source: 'manual' };
	const row = db
		.select()
		.from(schema.prices)
		.where(and(eq(schema.prices.instrumentId, instrument.id), lte(schema.prices.date, on)))
		.orderBy(desc(schema.prices.date))
		.limit(1)
		.get();
	const trade = db
		.select()
		.from(schema.trades)
		.where(and(eq(schema.trades.instrumentId, instrument.id), lte(schema.trades.date, on)))
		.orderBy(desc(schema.trades.date), desc(schema.trades.id))
		.limit(1)
		.get();
	if (row && (!trade || row.date >= trade.date))
		return { priceE4: row.closeE4, date: row.date, source: row.source };
	if (trade) return { priceE4: trade.priceE4, date: trade.date, source: 'trade' };
	return row ? { priceE4: row.closeE4, date: row.date, source: row.source } : null;
}

export function tradesOf(instrumentId: number): LotTrade[] {
	return db
		.select()
		.from(schema.trades)
		.where(eq(schema.trades.instrumentId, instrumentId))
		.orderBy(asc(schema.trades.date), asc(schema.trades.id))
		.all()
		.map((t) => ({
			id: t.id,
			date: t.date,
			side: t.side as LotTrade['side'],
			unitsE6: t.unitsE6,
			valueCents: t.valueCents,
			feeCents: t.feeCents
		}));
}

export interface Holding {
	instrument: Instrument;
	unitsE6: number;
	/** Cost of the parcels still held (FIFO). */
	costCents: number;
	price: Price | null;
	valueCents: number | null;
	lots: LotResult;
}

/** Units × price, rounded to the cent. */
export const valueOf = (unitsE6: number, priceE4: number) => Math.round((unitsE6 * priceE4) / 1e8);

/** Every instrument (of one account, when given) with what's held on the date. */
export function holdings(date: string | null, accountId?: number): Holding[] {
	const list = db
		.select()
		.from(schema.instruments)
		.where(accountId != null ? eq(schema.instruments.accountId, accountId) : undefined)
		.orderBy(asc(schema.instruments.ticker))
		.all();
	const method = lotMethod();
	return list.map((instrument) => {
		const lots = matchLots(tradesOf(instrument.id), method, date ?? undefined);
		const held = lots.parcels.reduce((s, p) => s + p.unitsE6, 0);
		const unitsE6 = openUnits(held);
		const costCents = unitsE6 ? lots.parcels.reduce((s, p) => s + p.costCents, 0) : 0;
		const price = unitsE6 > 0 ? priceOn(instrument, date) : null;
		return {
			instrument,
			unitsE6,
			costCents,
			price,
			valueCents: price ? valueOf(unitsE6, price.priceE4) : null,
			lots
		};
	});
}
