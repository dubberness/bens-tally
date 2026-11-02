import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { formatMoney } from '$lib/money';
import { db, schema } from '../../db';
import { findOrCreateAccount } from '../../accounts';
import { holdings } from '../../invest/holdings';
import { serialToDate, type Cell, type Sheet } from '../xlsx';
import { find, num, text } from './cells';
import type { SheetArea, SheetContext } from './types';

/*
 * Investments from the sheet: the ETFs tab's watch table (funds, targets, distribution
 * frequency), its purchase history (every buy and sell) and the Dividends tab. Columns
 * are found by header text; tickers, names and numbers all come from the workbook.
 */

const FREQUENCY: Record<number, string> = {
	1: 'monthly',
	3: 'quarterly',
	6: 'half-yearly',
	12: 'yearly'
};

/** 'ASX:VAS' → { ticker: 'VAS', exchange: 'ASX' }. */
export function splitTicker(raw: string): { ticker: string; exchange: string } | null {
	const t = raw.trim().toUpperCase();
	if (!t) return null;
	const m = t.match(/^([A-Z]+):([A-Z0-9.]+)$/);
	if (m) return { exchange: m[1], ticker: m[2] };
	return /^[A-Z0-9.]+$/.test(t) ? { exchange: 'ASX', ticker: t } : null;
}

/** Header row search: the column of each label (case-insensitive, starts-with). */
function columns(sheet: Sheet, row: number, labels: Record<string, string>) {
	const out: Record<string, number> = {};
	for (let c = 1; c <= sheet.maxCol; c++) {
		const v = text(sheet.at(row, c)).toLowerCase();
		for (const [key, label] of Object.entries(labels))
			if (out[key] == null && v.startsWith(label.toLowerCase())) out[key] = c;
	}
	return out;
}

const dateOf = (c: Cell) => (typeof c === 'number' ? serialToDate(c) : null);
const e6 = (n: number) => Math.round(n * 1e6);
const e4 = (n: number) => Math.round(n * 1e4);

interface WatchRow {
	ticker: string;
	exchange: string;
	name: string;
	units: number | null;
	targetBp: number | null;
	frequency: string | null;
}

function readWatch(sheet: Sheet): WatchRow[] {
	const head = find(sheet, (s) => s.toLowerCase() === 'tick' || s.toLowerCase() === 'ticker', 5);
	if (!head) throw new Error("Couldn't find the ETFs tab's watch table (a 'Tick' header)");
	const col = columns(sheet, head.row, {
		name: 'Fund Name',
		units: 'Held Units',
		target: 'Target Alloc',
		freq: 'Dividend Freq'
	});
	const out: WatchRow[] = [];
	for (let r = head.row + 1; r <= sheet.maxRow; r++) {
		const t = splitTicker(text(sheet.at(r, head.col)));
		if (!t) break;
		const target = col.target ? num(sheet.at(r, col.target)) : null;
		const freq = col.freq ? num(sheet.at(r, col.freq)) : null;
		out.push({
			...t,
			name: col.name ? text(sheet.at(r, col.name)) : '',
			units: col.units ? num(sheet.at(r, col.units)) : null,
			targetBp: target != null ? Math.round(target * 10_000) : null,
			frequency: freq != null ? (FREQUENCY[freq] ?? null) : null
		});
	}
	return out;
}

interface TradeRow {
	ticker: string;
	exchange: string;
	date: string;
	units: number;
	price: number;
	fee: number;
	value: number | null;
}

function readTrades(sheet: Sheet, report: SheetContext['report']): TradeRow[] {
	const head = find(sheet, (s) => s.toLowerCase().startsWith('order date'));
	if (!head)
		throw new Error("Couldn't find the ETFs tab's purchase history (an 'Order Date' header)");
	const col = columns(sheet, head.row, {
		ticker: 'Ticker',
		date: 'Order Date',
		units: '△ Units',
		price: 'Order Price',
		fee: 'Brokerage',
		value: 'Order Value'
	});
	if (!col.ticker || !col.units || !col.price)
		throw new Error("The ETFs tab's purchase history is missing Ticker, Units or Price");
	const out: TradeRow[] = [];
	let skipped = 0;
	for (let r = head.row + 1; r <= sheet.maxRow; r++) {
		const t = splitTicker(text(sheet.at(r, col.ticker)));
		const date = dateOf(sheet.at(r, col.date));
		const units = num(sheet.at(r, col.units));
		const price = num(sheet.at(r, col.price));
		if (!t && units == null) continue;
		if (!t || !date || !units || price == null) {
			skipped++;
			continue;
		}
		out.push({
			...t,
			date,
			units,
			price,
			fee: col.fee ? (num(sheet.at(r, col.fee)) ?? 0) : 0,
			value: col.value ? num(sheet.at(r, col.value)) : null
		});
	}
	if (skipped)
		report(
			'warn',
			`Skipped ${skipped} purchase row${skipped === 1 ? '' : 's'} missing a date, units or price.`
		);
	return out;
}

interface DistributionRow {
	ticker: string;
	exchange: string;
	date: string;
	amount: number;
	units: number | null;
	reinvested: boolean;
}

function readDistributions(sheet: Sheet): DistributionRow[] {
	const head = find(sheet, (s) => s.toLowerCase().startsWith('payment date'), 10);
	if (!head) return [];
	const col = columns(sheet, head.row, {
		ticker: 'Ticker',
		reinvested: 'Reinvested',
		amount: 'Net Amount',
		units: 'Units Held'
	});
	const out: DistributionRow[] = [];
	for (let r = head.row + 1; r <= sheet.maxRow; r++) {
		const date = dateOf(sheet.at(r, head.col));
		const t = col.ticker ? splitTicker(text(sheet.at(r, col.ticker))) : null;
		const amount = col.amount ? num(sheet.at(r, col.amount)) : null;
		if (!date || !t || amount == null) continue;
		out.push({
			...t,
			date,
			amount,
			units: col.units ? num(sheet.at(r, col.units)) : null,
			reinvested: col.reinvested ? /^y/i.test(text(sheet.at(r, col.reinvested))) : false
		});
	}
	return out;
}

/** The investment account the funds count toward: the one the history step made. */
function etfAccount() {
	const existing = db
		.select()
		.from(schema.accounts)
		.where(and(eq(schema.accounts.source, 'betashares'), eq(schema.accounts.kind, 'investment')))
		.get();
	return (
		existing ??
		findOrCreateAccount({ name: 'ETFs', kind: 'investment', side: 'asset', source: 'betashares' })
	);
}

let watchUnits = new Map<string, number>();

export const investArea: SheetArea = {
	id: 'invest',
	label: 'Invest',
	wipe: () => {
		db.delete(schema.trades).where(eq(schema.trades.source, 'sheet')).run();
		db.delete(schema.distributions).where(eq(schema.distributions.source, 'sheet')).run();
	},
	run: (ctx) => {
		if (!ctx.wb.has('ETFs')) {
			ctx.report('warn', 'No ETFs tab, so no investments were loaded.');
			return;
		}
		const sheet = ctx.wb.sheet('ETFs');
		const watch = readWatch(sheet);
		const trades = readTrades(sheet, ctx.report);
		const dists = ctx.wb.has('Dividends') ? readDistributions(ctx.wb.sheet('Dividends')) : [];
		const account = etfAccount();
		const now = ctx.now;

		// Funds: the watch table first (it has names and targets), then any ticker only
		// seen in the trades or distributions (funds sold before the watch table began).
		const ids = new Map<string, number>();
		const upsert = (w: Partial<WatchRow> & { ticker: string; exchange: string }) => {
			const found = db
				.select()
				.from(schema.instruments)
				.where(eq(schema.instruments.ticker, w.ticker))
				.get();
			if (found) {
				if (w.name !== undefined)
					db.update(schema.instruments)
						.set({
							name: w.name || found.name,
							exchange: w.exchange,
							targetBp: w.targetBp ?? null,
							distributionFrequency: w.frequency ?? found.distributionFrequency,
							accountId: found.accountId ?? account.id,
							updatedAt: now
						})
						.where(eq(schema.instruments.id, found.id))
						.run();
				ids.set(w.ticker, found.id);
				return;
			}
			const row = db
				.insert(schema.instruments)
				.values({
					ticker: w.ticker,
					exchange: w.exchange,
					name: w.name || null,
					accountId: account.id,
					targetBp: w.targetBp ?? null,
					distributionFrequency: w.frequency ?? null,
					createdAt: now,
					updatedAt: now
				})
				.returning()
				.get();
			ids.set(w.ticker, row.id);
		};
		for (const w of watch) upsert(w);
		for (const t of [...trades, ...dists])
			if (!ids.has(t.ticker)) upsert({ ticker: t.ticker, exchange: t.exchange });

		for (const t of trades) {
			const units = e6(Math.abs(t.units));
			const value = Math.round(Math.abs(t.value ?? t.units * t.price) * 100);
			db.insert(schema.trades)
				.values({
					instrumentId: ids.get(t.ticker)!,
					date: t.date,
					side: t.units > 0 ? 'buy' : 'sell',
					unitsE6: units,
					priceE4: e4(t.price),
					valueCents: value,
					feeCents: Math.round(t.fee * 100),
					source: 'sheet',
					createdAt: now,
					updatedAt: now
				})
				.run();
		}

		// A distribution typed twice for one fund and day is one payment.
		const seen = new Set<string>();
		let doubled = 0;
		for (const d of dists) {
			const key = `${d.ticker}|${d.date}`;
			if (seen.has(key)) {
				doubled++;
				continue;
			}
			seen.add(key);
			db.insert(schema.distributions)
				.values({
					instrumentId: ids.get(d.ticker)!,
					date: d.date,
					unitsE6: d.units != null ? e6(d.units) : null,
					perUnitE6: d.units ? Math.round((d.amount / d.units) * 1e6) : null,
					amountCents: Math.round(d.amount * 100),
					reinvested: d.reinvested,
					source: 'sheet',
					createdAt: now,
					updatedAt: now
				})
				.onConflictDoNothing()
				.run();
		}

		// Funds no longer in the watch table keep no target.
		const watched = watch.map((w) => w.ticker);
		if (watched.length)
			db.update(schema.instruments)
				.set({ targetBp: null })
				.where(
					and(
						notInArray(schema.instruments.ticker, watched),
						inArray(schema.instruments.id, [...ids.values()])
					)
				)
				.run();

		watchUnits = new Map(watch.filter((w) => w.units != null).map((w) => [w.ticker, w.units!]));
		const totalBought = trades
			.filter((t) => t.units > 0)
			.reduce((s, t) => s + Math.abs(t.value ?? t.units * t.price) + t.fee, 0);
		ctx.report(
			'ok',
			`Investments: ${ids.size} funds, ${trades.length} trades (${formatMoney(Math.round(totalBought * 100))} bought in all), ${seen.size} distributions.`
		);
		if (doubled)
			ctx.report(
				'warn',
				`${doubled} distribution${doubled === 1 ? ' was' : 's were'} listed twice for the same fund and day; kept once.`
			);
	},
	validate: (ctx) => {
		if (!watchUnits.size) return;
		const off: string[] = [];
		for (const h of holdings(null)) {
			const sheetUnits = watchUnits.get(h.instrument.ticker);
			if (sheetUnits == null) continue;
			const diff = h.unitsE6 / 1e6 - sheetUnits;
			if (Math.abs(diff) > 0.0001)
				off.push(`${h.instrument.ticker} ${h.unitsE6 / 1e6} vs ${sheetUnits}`);
		}
		for (const h of holdings(null))
			if (h.lots.oversoldE6 > 0)
				off.push(
					`${h.instrument.ticker} sells ${h.lots.oversoldE6 / 1e6} more units than were bought`
				);
		if (off.length) ctx.report('warn', `Units held don't match the ETFs tab: ${off.join('; ')}.`);
		else ctx.report('ok', `Units held match the ETFs tab for all ${watchUnits.size} funds.`);
	}
};
