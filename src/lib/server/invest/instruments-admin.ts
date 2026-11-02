import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { setSetting } from '../settings';
import { DRIFT_KEY } from './view';

export const PRICE_SOURCES = ['yahoo', 'sheet_csv', 'manual'] as const;
export const FREQUENCIES = ['monthly', 'quarterly', 'half-yearly', 'yearly'] as const;

export interface InstrumentInput {
	ticker: string;
	name: string | null;
	exchange: string;
	accountId: number | null;
	priceSource: string;
	sheetCsvUrl: string | null;
	manualPriceE4: number | null;
	targetBp: number | null;
	distributionFrequency: string | null;
}

/** '12.5' → 1250; blank → null. */
export function parsePercentBp(s: string): number | null | 'bad' {
	const t = s.trim().replace(/%$/, '');
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : 'bad';
}

/** '41.18' → 411800; blank → null. */
export function parsePriceE4(s: string): number | null | 'bad' {
	const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) && n > 0 ? Math.round(n * 1e4) : 'bad';
}

/** Checks a form's fields; returns the values or a message for Ben. */
export function readInstrumentForm(f: FormData): InstrumentInput | string {
	const ticker = String(f.get('ticker') ?? '')
		.trim()
		.toUpperCase()
		.replace(/^[A-Z]+:/, '');
	if (!/^[A-Z0-9.]{1,12}$/.test(ticker)) return 'Enter a ticker like VAS.';
	const priceSource = String(f.get('priceSource') ?? 'yahoo');
	if (!PRICE_SOURCES.includes(priceSource as (typeof PRICE_SOURCES)[number]))
		return 'Pick where the price comes from.';
	const target = parsePercentBp(String(f.get('target') ?? ''));
	if (target === 'bad') return 'Target must be a percentage between 0 and 100.';
	const manual = parsePriceE4(String(f.get('manualPrice') ?? ''));
	if (manual === 'bad') return 'Your own price must be a positive number.';
	if (priceSource === 'manual' && manual == null) return 'Enter your own price, or pick a feed.';
	const url = String(f.get('sheetCsvUrl') ?? '').trim() || null;
	if (url && !/^https:\/\//.test(url)) return 'The sheet CSV link must start with https://.';
	if (priceSource === 'sheet_csv' && !url) return 'Paste the published sheet CSV link.';
	const freq = String(f.get('frequency') ?? '') || null;
	if (freq && !FREQUENCIES.includes(freq as (typeof FREQUENCIES)[number]))
		return 'Pick how often it pays.';
	const accountId = Number(f.get('accountId')) || null;
	return {
		ticker,
		name: String(f.get('name') ?? '').trim() || null,
		exchange:
			String(f.get('exchange') ?? 'ASX')
				.trim()
				.toUpperCase() || 'ASX',
		accountId,
		priceSource,
		sheetCsvUrl: url,
		manualPriceE4: priceSource === 'manual' ? manual : null,
		targetBp: target,
		distributionFrequency: freq
	};
}

function tickerTaken(ticker: string, exceptId?: number): boolean {
	const row = db
		.select({ id: schema.instruments.id })
		.from(schema.instruments)
		.where(eq(schema.instruments.ticker, ticker))
		.get();
	return !!row && row.id !== exceptId;
}

export function createInstrument(v: InstrumentInput): number | string {
	if (tickerTaken(v.ticker)) return `${v.ticker} is already listed.`;
	const now = new Date();
	return db
		.insert(schema.instruments)
		.values({ ...v, createdAt: now, updatedAt: now })
		.returning({ id: schema.instruments.id })
		.get().id;
}

export function updateInstrument(id: number, v: InstrumentInput): string | null {
	if (tickerTaken(v.ticker, id)) return `${v.ticker} is already listed.`;
	db.update(schema.instruments)
		.set({ ...v, updatedAt: new Date() })
		.where(eq(schema.instruments.id, id))
		.run();
	return null;
}

/** Only a fund with no trades or distributions can go; otherwise its history would break. */
export function deleteInstrument(id: number): string | null {
	const used =
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.trades)
			.where(eq(schema.trades.instrumentId, id))
			.get()!.n +
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.distributions)
			.where(eq(schema.distributions.instrumentId, id))
			.get()!.n;
	if (used) return 'This fund has trades or distributions, so it stays. Clear its target instead.';
	db.delete(schema.instruments).where(eq(schema.instruments.id, id)).run();
	return null;
}

export function setDriftBand(bp: number) {
	setSetting(DRIFT_KEY, bp);
}

/** Investment accounts a fund can count toward. */
export function investmentAccounts() {
	return db
		.select({ id: schema.accounts.id, name: schema.accounts.name })
		.from(schema.accounts)
		.where(and(eq(schema.accounts.kind, 'investment'), sql`${schema.accounts.closedOn} is null`))
		.all();
}
