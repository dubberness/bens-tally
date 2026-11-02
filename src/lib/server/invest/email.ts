import { and, desc, eq, sql } from 'drizzle-orm';
import { parseBetasharesRaw, type ParsedIncomeLine, type ParsedTrade } from '$lib/betashares/parse';
import { db, schema, sqlite } from '../db';
import { mailWorker } from '../env';
import { getSetting, setSetting } from '../settings';
import { instrumentFor, knownTrades } from './csv-import';
import { matchTrade, type DiffField, type IncomingTrade } from './match';
import { addDistribution, addTrade, updateTrade, type DistributionInput } from './records';

/*
 * Betashares emails, collected from the mail Worker. The app reads each raw email with
 * its own parser (so a parser fix needs no Worker deploy), then applies it the same way
 * as a CSV row: already here, gains its order ID, added, or waits in the Inbox.
 */

export interface WorkerMessage {
	id: string;
	receivedAt: number;
	sender: string | null;
	subject: string | null;
	raw: string;
}

export interface WorkerStatus {
	at: number;
	pending: number;
	rejected: number;
	lastKeptAt: number | null;
	refused: { at: number; sender: string | null; subject: string | null; reason: string }[];
}

export const STATUS_KEY = 'invest.email_status';
/** An income email's payment date can sit a few days from the one typed in the sheet. */
export const DISTRIBUTION_WINDOW_DAYS = 14;

export type DistributionField = 'date' | 'amount' | 'reinvested';

export interface IncomeLineResult {
	ticker: string;
	instrumentId: number;
	distributionId: number | null;
	outcome: 'added' | 'same' | 'differs';
	fields: DistributionField[];
	incoming: DistributionInput;
}

/** What an email item's `result` holds; the CSV kinds ('differs', 'problem') are shared. */
export type EmailItemResult =
	| { kind: 'trade'; tradeId: number; outcome: 'added' | 'same' | 'link' }
	| { kind: 'differs'; tradeId: number; incoming: IncomingTrade; fields: DiffField[] }
	| { kind: 'income'; date: string; lines: IncomeLineResult[] }
	| { kind: 'ignored'; reason: string }
	| { kind: 'unknown'; reason: string };

export const emailConfigured = () => !!(mailWorker.url && mailWorker.token);

const days = (a: string, b: string) =>
	Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

function applyTrade(p: ParsedTrade, itemId: number, now: Date): EmailItemResult {
	const instrumentId = instrumentFor(p.ticker, now);
	if (p.fundName)
		db.update(schema.instruments)
			.set({ name: p.fundName })
			.where(and(eq(schema.instruments.id, instrumentId), sql`${schema.instruments.name} is null`))
			.run();
	// The fill price is a fallback price for that day when no feed has one.
	db.insert(schema.prices)
		.values({ instrumentId, date: p.date, closeE4: p.priceE4, source: 'email', fetchedAt: now })
		.onConflictDoNothing()
		.run();
	const incoming: IncomingTrade = {
		orderId: p.orderId,
		ticker: p.ticker,
		date: p.date,
		side: p.side,
		unitsE6: p.unitsE6,
		priceE4: p.priceE4,
		valueCents: p.valueCents,
		feeCents: p.feeCents
	};
	const m = matchTrade(incoming, knownTrades());
	if (m.kind === 'differs') return { kind: 'differs', tradeId: m.id, incoming, fields: m.fields };
	if (m.kind === 'new') {
		const id = addTrade({ instrumentId, ...incoming, note: null }, 'email', itemId);
		if (typeof id === 'string') return { kind: 'unknown', reason: id };
		return { kind: 'trade', tradeId: id, outcome: 'added' };
	}
	if (m.kind === 'link')
		updateTrade(m.id, { orderId: p.orderId }, 'Order ID from a Betashares email');
	// Point the trade at its email when it has none, so its page can show it.
	db.update(schema.trades)
		.set({ importItemId: itemId })
		.where(and(eq(schema.trades.id, m.id), sql`${schema.trades.importItemId} is null`))
		.run();
	return { kind: 'trade', tradeId: m.id, outcome: m.kind };
}

function applyIncomeLine(
	date: string,
	l: ParsedIncomeLine,
	itemId: number,
	now: Date
): IncomeLineResult {
	const instrumentId = instrumentFor(l.ticker, now);
	const incoming: DistributionInput = {
		instrumentId,
		date,
		unitsE6: l.unitsE6,
		perUnitE6: l.perUnitE6,
		amountCents: l.amountCents,
		frankingCents: null,
		reinvested: l.reinvested,
		note: null
	};
	const near = db
		.select()
		.from(schema.distributions)
		.where(eq(schema.distributions.instrumentId, instrumentId))
		.all()
		.filter((d) => days(d.date, date) <= DISTRIBUTION_WINDOW_DAYS)
		.sort((a, b) => days(a.date, date) - days(b.date, date))[0];
	const base = { ticker: l.ticker, instrumentId, incoming };
	if (!near) {
		const id = addDistribution(incoming, 'email', itemId);
		return typeof id === 'number'
			? { ...base, distributionId: id, outcome: 'added', fields: [] }
			: { ...base, distributionId: null, outcome: 'differs', fields: [] };
	}
	const fields: DistributionField[] = [];
	if (near.date !== date) fields.push('date');
	if (Math.abs(near.amountCents - l.amountCents) > 1) fields.push('amount');
	if (near.reinvested !== l.reinvested) fields.push('reinvested');
	if (!fields.length && near.importItemId == null)
		db.update(schema.distributions)
			.set({ importItemId: itemId })
			.where(eq(schema.distributions.id, near.id))
			.run();
	return { ...base, distributionId: near.id, outcome: fields.length ? 'differs' : 'same', fields };
}

/** Stores one Worker message as an import item and applies it. False when already stored. */
export function storeEmail(m: WorkerMessage, now = new Date()): boolean {
	return sqlite.transaction(() => {
		const parsed = parseBetasharesRaw(m.raw);
		const inserted = db
			.insert(schema.importItems)
			.values({
				source: 'email',
				externalId: m.id,
				receivedAt: new Date(m.receivedAt),
				subject: parsed.subject || m.subject,
				raw: m.raw,
				status: 'review',
				createdAt: now
			})
			.onConflictDoNothing()
			.returning({ id: schema.importItems.id })
			.get();
		if (!inserted) return false;
		let result: EmailItemResult;
		let status: 'applied' | 'review' | 'ignored';
		if (parsed.kind === 'trade') {
			result = applyTrade(parsed, inserted.id, now);
			status = result.kind === 'trade' ? 'applied' : 'review';
		} else if (parsed.kind === 'income') {
			const lines = parsed.lines.map((l) => applyIncomeLine(parsed.date, l, inserted.id, now));
			result = { kind: 'income', date: parsed.date, lines };
			status = lines.some((l) => l.outcome === 'differs') ? 'review' : 'applied';
		} else if (parsed.kind === 'ignored') {
			result = { kind: 'ignored', reason: parsed.reason };
			status = 'ignored';
		} else {
			result = { kind: 'unknown', reason: parsed.reason };
			status = 'review';
		}
		db.update(schema.importItems)
			.set({ status, result })
			.where(eq(schema.importItems.id, inserted.id))
			.run();
		return true;
	})();
}

async function call<T>(path: string, init: RequestInit = {}, fetcher = fetch): Promise<T> {
	const res = await fetcher(`${mailWorker.url}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${mailWorker.token}`,
			'content-type': 'application/json',
			...(init.headers ?? {})
		},
		signal: AbortSignal.timeout(20_000)
	});
	if (res.status === 401) throw new Error('The mail Worker refused the token (WORKER_TOKEN).');
	if (!res.ok) throw new Error(`The mail Worker answered ${res.status}.`);
	return (await res.json()) as T;
}

/** The scheduled job: take new mail, store and apply it, confirm it, note the Worker's status. */
export async function collectEmails(now = new Date(), fetcher = fetch): Promise<string> {
	if (!emailConfigured()) return 'Not set up: the container has no WORKER_URL and WORKER_TOKEN.';
	let stored = 0;
	let seen = 0;
	for (let round = 0; round < 10; round++) {
		const { messages } = await call<{ messages: WorkerMessage[] }>(
			'/messages?limit=50',
			{},
			fetcher
		);
		if (!messages.length) break;
		for (const m of messages) if (storeEmail(m, now)) stored++;
		seen += messages.length;
		await call(
			'/ack',
			{ method: 'POST', body: JSON.stringify({ ids: messages.map((m) => m.id) }) },
			fetcher
		);
		if (messages.length < 50) break;
	}
	const s = await call<Omit<WorkerStatus, 'at'>>('/status', {}, fetcher);
	setSetting(STATUS_KEY, { ...s, at: now.getTime() } satisfies WorkerStatus);
	if (!seen) return 'No new emails.';
	return `${stored} new email${stored === 1 ? '' : 's'} stored${seen > stored ? `, ${seen - stored} already had` : ''}.`;
}

export interface EmailStatus {
	configured: boolean;
	worker: WorkerStatus | null;
	lastEmailAt: Date | null;
}

export function emailStatus(): EmailStatus {
	const last = db
		.select({ at: schema.importItems.receivedAt })
		.from(schema.importItems)
		.where(eq(schema.importItems.source, 'email'))
		.orderBy(desc(schema.importItems.receivedAt))
		.get();
	return {
		configured: emailConfigured(),
		worker: getSetting<WorkerStatus>(STATUS_KEY) ?? null,
		lastEmailAt: last?.at ?? null
	};
}
