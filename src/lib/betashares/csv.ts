/**
 * Betashares trade-history CSV: a tolerant reader. Column names vary between
 * exports, so the app guesses a mapping from the header row, shows a preview and
 * lets Ben change any column before applying. Pure, so it can be tested alone.
 */
import { scaled } from './parse';

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	const src = text.replace(/^﻿/, '');
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (quoted) {
			if (ch === '"' && src[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && src[i + 1] === '\n') i++;
			row.push(cell);
			if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
			row = [];
			cell = '';
		} else cell += ch;
	}
	row.push(cell);
	if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
	return rows;
}

export const CSV_FIELDS = [
	{ key: 'date', label: 'Date', required: true },
	{ key: 'ticker', label: 'Ticker', required: true },
	{ key: 'side', label: 'Buy or sell', required: false },
	{ key: 'units', label: 'Units', required: true },
	{ key: 'price', label: 'Price', required: false },
	{ key: 'value', label: 'Value', required: false },
	{ key: 'fee', label: 'Fee', required: false },
	{ key: 'orderId', label: 'Order ID', required: false },
	{ key: 'status', label: 'Status', required: false }
] as const;

export type CsvField = (typeof CSV_FIELDS)[number]['key'];
/** Column index per field; -1 = not in the file. */
export type CsvMapping = Record<CsvField, number>;

const SYNONYMS: Record<CsvField, RegExp[]> = {
	date: [/^(trade|fill(ed)?|execution|settlement|order|transaction)?\s*date/i, /^date/i, /time/i],
	ticker: [/ticker|symbol|asx code|security code|^code$|instrument|investment/i],
	side: [/^(buy\s*\/\s*sell|side|type|action|direction|transaction type|order type)$/i],
	units: [/quantity|units|^qty|shares|volume/i],
	price: [/(average|avg|fill|unit|trade)?\s*price/i],
	value: [/^(value|amount|consideration|gross|trade value|order value|net amount|total value)/i],
	fee: [/fee|brokerage|commission/i],
	orderId: [/order\s*(id|number|no|reference|ref)|reference|^id$/i],
	status: [/status/i]
};

export function guessMapping(headers: string[]): CsvMapping {
	const used = new Set<number>();
	const mapping = {} as CsvMapping;
	for (const f of CSV_FIELDS) {
		let found = -1;
		for (const re of SYNONYMS[f.key]) {
			found = headers.findIndex((h, i) => !used.has(i) && re.test(h.trim()));
			if (found >= 0) break;
		}
		if (found >= 0) used.add(found);
		mapping[f.key] = found;
	}
	return mapping;
}

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** '28/10/2026', '2026-10-28', '28 Oct 2026', '28-Oct-26', with or without a time. */
export function parseCsvDate(s: string): string | null {
	const t = s.trim();
	let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
	m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
	if (m) {
		const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
		return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
	}
	m = t.match(/^(?:[A-Za-z]+,?\s+)?(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s-]+(\d{2,4})/);
	if (m) {
		const mo = MON.indexOf(m[2].toLowerCase()) + 1;
		const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
		if (mo) return `${y}-${pad(mo)}-${pad(+m[1])}`;
	}
	return null;
}

function money(s: string): number | null {
	const neg = /^\(.*\)$/.test(s.trim()) || /^-/.test(s.trim());
	const v = scaled(s.replace(/[()$A-Za-z\s]/g, '').replace(/^-/, ''), 2);
	return v == null ? null : neg ? -v : v;
}

export interface CsvTrade {
	line: number;
	date: string;
	ticker: string;
	side: 'buy' | 'sell';
	unitsE6: number;
	priceE4: number;
	valueCents: number;
	feeCents: number;
	orderId: string | null;
	raw: string[];
}

export interface CsvProblem {
	line: number;
	message: string;
	raw: string[];
}

/** Applies a mapping to every data row. Rows that can't be read come back as problems. */
export function readTrades(
	rows: string[][],
	mapping: CsvMapping
): { trades: CsvTrade[]; problems: CsvProblem[]; skipped: number } {
	const trades: CsvTrade[] = [];
	const problems: CsvProblem[] = [];
	let skipped = 0;
	const get = (r: string[], f: CsvField) => (mapping[f] >= 0 ? (r[mapping[f]] ?? '').trim() : '');
	rows.slice(1).forEach((r, i) => {
		const line = i + 2;
		const status = get(r, 'status');
		if (status && /cancel|reject|expired|pending|open|unfilled/i.test(status)) {
			skipped++;
			return;
		}
		const date = parseCsvDate(get(r, 'date'));
		const ticker = get(r, 'ticker')
			.replace(/^[A-Z]+:/, '')
			.replace(/\.AX$/i, '')
			.toUpperCase();
		const unitsRaw = get(r, 'units');
		const unitsSigned = scaled(unitsRaw.replace(/[()]/g, ''), 6);
		const sideText = get(r, 'side').toLowerCase();
		let side: 'buy' | 'sell' | null = /sell|^s$|sold|redemption|withdraw/.test(sideText)
			? 'sell'
			: /buy|^b$|bought|purchase|application|invest/.test(sideText)
				? 'buy'
				: null;
		if (!side && unitsSigned != null)
			side = unitsSigned < 0 || /^\(/.test(unitsRaw) ? 'sell' : 'buy';
		const unitsE6 = unitsSigned == null ? null : Math.abs(unitsSigned);
		let priceE4 = get(r, 'price') ? scaled(get(r, 'price').replace(/[$\s]/g, ''), 4) : null;
		let valueCents = get(r, 'value') ? money(get(r, 'value')) : null;
		const feeCents = get(r, 'fee') ? Math.abs(money(get(r, 'fee')) ?? 0) : 0;
		if (valueCents != null) valueCents = Math.abs(valueCents);
		if (priceE4 != null) priceE4 = Math.abs(priceE4);
		if (unitsE6 && valueCents == null && priceE4 != null)
			valueCents = Math.round((unitsE6 / 1e6) * (priceE4 / 1e4) * 100);
		if (unitsE6 && priceE4 == null && valueCents != null)
			priceE4 = Math.round((valueCents / 100 / (unitsE6 / 1e6)) * 1e4);
		const missing = [
			!date && 'date',
			!ticker && 'ticker',
			!unitsE6 && 'units',
			!side && 'buy or sell',
			(priceE4 == null || valueCents == null) && 'price or value'
		].filter(Boolean);
		if (missing.length) {
			problems.push({ line, message: `Couldn't read the ${missing.join(', ')}`, raw: r });
			return;
		}
		trades.push({
			line,
			date: date!,
			ticker,
			side: side!,
			unitsE6: unitsE6!,
			priceE4: priceE4!,
			valueCents: valueCents!,
			feeCents,
			orderId: get(r, 'orderId') ? get(r, 'orderId').toUpperCase() : null,
			raw: r
		});
	});
	return { trades, problems, skipped };
}
