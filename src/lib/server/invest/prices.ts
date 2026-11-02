import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { localDate } from '$lib/time';
import { db, schema } from '../db';
import { parseCsv } from '$lib/betashares/csv';
import { holdings, type Instrument } from './holdings';

/*
 * Prices: Yahoo Finance's chart data (about 20 minutes delayed) for each fund held, or a
 * published sheet CSV (e.g. a GOOGLEFINANCE cell) where Ben picks that instead. The first
 * fetch for a fund backfills daily closes from its first trade so past months value too.
 */

const UA = 'Mozilla/5.0 (compatible; bens-tally)';

/** Yahoo's symbol: ASX funds take '.AX'. */
export function yahooSymbol(i: Pick<Instrument, 'ticker' | 'exchange'>): string {
	return i.exchange === 'ASX' ? `${i.ticker}.AX` : i.ticker;
}

export interface Close {
	date: string;
	closeE4: number;
}

/** Daily closes (local dates) from a Yahoo chart response, plus the latest price for today. */
export function readChart(json: unknown, today: string): Close[] {
	const r = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
		| {
				meta?: { regularMarketPrice?: number; regularMarketTime?: number };
				timestamp?: number[];
				indicators?: { quote?: { close?: (number | null)[] }[] };
		  }
		| undefined;
	if (!r) return [];
	const out = new Map<string, number>();
	const ts = r.timestamp ?? [];
	const closes = r.indicators?.quote?.[0]?.close ?? [];
	ts.forEach((t, i) => {
		const c = closes[i];
		if (c != null && Number.isFinite(c))
			out.set(localDate(new Date(t * 1000)), Math.round(c * 1e4));
	});
	const live = r.meta?.regularMarketPrice;
	const at = r.meta?.regularMarketTime;
	if (live != null && at != null) {
		const d = localDate(new Date(at * 1000));
		if (d <= today) out.set(d, Math.round(live * 1e4));
	}
	return [...out]
		.map(([date, closeE4]) => ({ date, closeE4 }))
		.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchYahoo(i: Instrument, from: string | null, now: Date): Promise<Close[]> {
	const sym = encodeURIComponent(yahooSymbol(i));
	const range = from
		? `period1=${Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 86_400}&period2=${Math.floor(now.getTime() / 1000)}`
		: 'range=5d';
	const res = await fetch(
		`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?${range}&interval=1d`,
		{ headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) }
	);
	if (!res.ok) throw new Error(`Yahoo ${res.status} for ${yahooSymbol(i)}`);
	return readChart(await res.json(), localDate(now));
}

/** The price in a published CSV: the number next to the ticker, or the only number in it. */
export function readSheetCsv(text: string, ticker: string): number | null {
	const rows = parseCsv(text);
	const numberIn = (cells: string[]) => {
		for (const c of cells) {
			const n = Number(c.replace(/[$,\s]/g, ''));
			if (c.trim() && Number.isFinite(n)) return n;
		}
		return null;
	};
	const row = rows.find((r) =>
		r.some((c) => c.trim().toUpperCase().replace(/^ASX:/, '') === ticker)
	);
	if (row) return numberIn(row);
	const all = rows
		.flat()
		.filter((c) => c.trim() && Number.isFinite(Number(c.replace(/[$,\s]/g, ''))));
	return all.length === 1 ? Number(all[0].replace(/[$,\s]/g, '')) : null;
}

async function fetchSheetCsv(i: Instrument, now: Date): Promise<Close[]> {
	if (!i.sheetCsvUrl) throw new Error(`${i.ticker} has no sheet CSV link`);
	const res = await fetch(i.sheetCsvUrl, { signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`Sheet CSV ${res.status} for ${i.ticker}`);
	const n = readSheetCsv(await res.text(), i.ticker);
	if (n == null || n <= 0) throw new Error(`No price for ${i.ticker} in its sheet CSV`);
	return [{ date: localDate(now), closeE4: Math.round(n * 1e4) }];
}

function store(instrumentId: number, closes: Close[], source: string, now: Date) {
	for (const c of closes)
		db.insert(schema.prices)
			.values({ instrumentId, date: c.date, closeE4: c.closeE4, source, fetchedAt: now })
			.onConflictDoUpdate({
				target: [schema.prices.instrumentId, schema.prices.date],
				set: { closeE4: c.closeE4, source, fetchedAt: now }
			})
			.run();
}

function firstTradeDate(instrumentId: number): string | null {
	return (
		db
			.select({ date: schema.trades.date })
			.from(schema.trades)
			.where(eq(schema.trades.instrumentId, instrumentId))
			.orderBy(asc(schema.trades.date))
			.limit(1)
			.get()?.date ?? null
	);
}

function hasPricesSince(instrumentId: number, date: string): boolean {
	return !!db
		.select({ n: sql`1` })
		.from(schema.prices)
		.where(and(eq(schema.prices.instrumentId, instrumentId), gte(schema.prices.date, date)))
		.limit(1)
		.get();
}

export interface PriceRun {
	updated: string[];
	failed: string[];
	message: string;
}

/** Fetch prices for every fund held now (manual-priced funds are skipped). */
export async function updatePrices(now = new Date()): Promise<PriceRun> {
	const held = holdings(null).filter((h) => h.unitsE6 > 0);
	const updated: string[] = [];
	const failed: string[] = [];
	for (const { instrument: i } of held) {
		if (i.priceSource === 'manual') continue;
		try {
			if (i.priceSource === 'sheet_csv') {
				store(i.id, await fetchSheetCsv(i, now), 'sheet_csv', now);
			} else {
				const first = firstTradeDate(i.id);
				const backfill = first && !hasPricesSince(i.id, first) ? first : null;
				const closes = await fetchYahoo(i, backfill, now);
				if (!closes.length) throw new Error(`Yahoo had no prices for ${yahooSymbol(i)}`);
				store(i.id, closes, 'yahoo', now);
			}
			updated.push(i.ticker);
		} catch (err) {
			failed.push(`${i.ticker}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	if (failed.length && !updated.length) throw new Error(failed.join('; '));
	const message =
		`${updated.length} price${updated.length === 1 ? '' : 's'} updated` +
		(failed.length ? `; failed: ${failed.join('; ')}` : '');
	return { updated, failed, message };
}

/** Latest stored price date across held funds, for the stale-feed check. */
export function latestPriceDates(): {
	ticker: string;
	date: string | null;
	source: string | null;
}[] {
	return holdings(null)
		.filter((h) => h.unitsE6 > 0)
		.map((h) => ({
			ticker: h.instrument.ticker,
			date: h.price?.date ?? null,
			source: h.price?.source ?? null
		}));
}
