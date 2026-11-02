import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
	CSV_FIELDS,
	guessMapping,
	parseCsv,
	readTrades,
	type CsvMapping,
	type CsvProblem,
	type CsvTrade
} from '$lib/betashares/csv';
import { db, schema, sqlite } from '../db';
import { defaultInvestAccount } from './instruments-admin';
import { matchTrade, type DiffField, type IncomingTrade, type KnownTrade } from './match';
import { addTrade, updateTrade } from './records';

/*
 * Betashares trade-history CSV. Upload → preview (column mapping Ben can change, and
 * what each row would do) → apply. Rows already in the app are left alone; rows that
 * look like a trade the app has but with different numbers go to the Inbox for Ben.
 */

export type RowOutcome = 'new' | 'same' | 'link' | 'differs';

export interface PreviewRow extends Omit<CsvTrade, 'raw'> {
	outcome: RowOutcome;
	tradeId: number | null;
	fields: DiffField[];
	newFund: boolean;
}

export interface CsvPreview {
	headers: string[];
	/** The first data row, to show what each column holds. */
	sampleRow: string[];
	mapping: CsvMapping;
	rows: PreviewRow[];
	problems: CsvProblem[];
	skipped: number;
	counts: Record<RowOutcome | 'problems', number>;
	newFunds: string[];
}

/** Review items in the Inbox from a CSV row. */
export type CsvItemResult =
	| { kind: 'differs'; tradeId: number; incoming: IncomingTrade; fields: DiffField[] }
	| { kind: 'problem'; message: string; headers: string[]; row: string[] };

export function knownTrades(): KnownTrade[] {
	return db
		.select({
			id: schema.trades.id,
			orderId: schema.trades.orderId,
			ticker: schema.instruments.ticker,
			date: schema.trades.date,
			side: schema.trades.side,
			unitsE6: schema.trades.unitsE6,
			priceE4: schema.trades.priceE4,
			valueCents: schema.trades.valueCents,
			feeCents: schema.trades.feeCents
		})
		.from(schema.trades)
		.innerJoin(schema.instruments, eq(schema.trades.instrumentId, schema.instruments.id))
		.all();
}

/** Reads the file with `mapping`, or a guessed one. */
export function previewCsv(text: string, mapping?: CsvMapping): CsvPreview {
	const rows = parseCsv(text);
	if (rows.length < 2) throw new Error('That file has no rows under its header.');
	const headers = rows[0];
	const map = mapping ?? guessMapping(headers);
	const read = readTrades(rows, map);
	const known = knownTrades();
	const tickers = new Set(
		db
			.select({ t: schema.instruments.ticker })
			.from(schema.instruments)
			.all()
			.map((r) => r.t)
	);
	const taken = new Set<number>();
	const out: PreviewRow[] = read.trades.map(({ raw: _raw, ...t }) => {
		const m = matchTrade(t, known, taken);
		if (m.kind !== 'new') taken.add(m.id);
		return {
			...t,
			outcome: m.kind,
			tradeId: m.kind === 'new' ? null : m.id,
			fields: m.kind === 'differs' ? m.fields : [],
			newFund: !tickers.has(t.ticker)
		};
	});
	const counts = { new: 0, same: 0, link: 0, differs: 0, problems: read.problems.length };
	for (const r of out) counts[r.outcome]++;
	return {
		headers,
		sampleRow: rows[1],
		mapping: map,
		rows: out,
		problems: read.problems,
		skipped: read.skipped,
		counts,
		newFunds: [...new Set(out.filter((r) => r.newFund).map((r) => r.ticker))]
	};
}

/** The mapping from the preview form's selects. */
export function mappingFrom(f: FormData): CsvMapping {
	const m = {} as CsvMapping;
	for (const field of CSV_FIELDS) {
		const v = Number(f.get(`map_${field.key}`));
		m[field.key] = Number.isInteger(v) ? v : -1;
	}
	return m;
}

/** A ticker's instrument, made on the spot for a fund the app hasn't seen. */
export function instrumentFor(ticker: string, now = new Date()): number {
	const found = db
		.select({ id: schema.instruments.id })
		.from(schema.instruments)
		.where(eq(schema.instruments.ticker, ticker))
		.get();
	if (found) return found.id;
	return db
		.insert(schema.instruments)
		.values({
			ticker,
			exchange: 'ASX',
			accountId: defaultInvestAccount()?.id ?? null,
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: schema.instruments.id })
		.get().id;
}

const rowKey = (cells: string[]) =>
	'row:' + createHash('sha1').update(cells.join('\u001f')).digest('hex').slice(0, 20);

export interface CsvApplied {
	added: number;
	linked: number;
	same: number;
	review: number;
	alreadyInInbox: number;
	newFunds: string[];
}

export function applyCsv(text: string, mapping: CsvMapping, fileName: string): CsvApplied {
	const preview = previewCsv(text, mapping);
	const rows = parseCsv(text);
	const headers = rows[0];
	const now = new Date();
	const out: CsvApplied = {
		added: 0,
		linked: 0,
		same: preview.counts.same,
		review: 0,
		alreadyInInbox: 0,
		newFunds: preview.newFunds
	};
	const toInbox = (externalId: string, line: number, result: CsvItemResult) => {
		const r = db
			.insert(schema.importItems)
			.values({
				source: 'csv',
				externalId,
				receivedAt: now,
				subject: `${fileName}, line ${line}`,
				raw: JSON.stringify({ headers, row: rows[line - 1] }),
				status: 'review',
				result,
				createdAt: now
			})
			.onConflictDoNothing()
			.run();
		if (r.changes) out.review++;
		else out.alreadyInInbox++;
	};

	sqlite.transaction(() => {
		for (const r of preview.rows) {
			const incoming: IncomingTrade = {
				orderId: r.orderId,
				ticker: r.ticker,
				date: r.date,
				side: r.side,
				unitsE6: r.unitsE6,
				priceE4: r.priceE4,
				valueCents: r.valueCents,
				feeCents: r.feeCents
			};
			if (r.outcome === 'new') {
				const id = addTrade(
					{
						instrumentId: instrumentFor(r.ticker, now),
						date: r.date,
						side: r.side,
						unitsE6: r.unitsE6,
						priceE4: r.priceE4,
						valueCents: r.valueCents,
						feeCents: r.feeCents,
						orderId: r.orderId,
						note: null
					},
					'csv'
				);
				if (typeof id === 'number') out.added++;
			} else if (r.outcome === 'link') {
				if (!updateTrade(r.tradeId!, { orderId: r.orderId }, 'Order ID from the Betashares CSV'))
					out.linked++;
			} else if (r.outcome === 'differs') {
				toInbox(r.orderId ? `order:${r.orderId}` : rowKey(rows[r.line - 1]), r.line, {
					kind: 'differs',
					tradeId: r.tradeId!,
					incoming,
					fields: r.fields
				});
			}
		}
		for (const p of preview.problems)
			toInbox(rowKey(p.raw), p.line, {
				kind: 'problem',
				message: p.message,
				headers,
				row: p.raw
			});
	})();
	return out;
}
