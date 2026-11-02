import { and, eq, gte, inArray, isNull, min, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { findOrCreateAccount } from '../accounts';
import { getSetting, setSetting } from '../settings';
import { onTransactionsSynced } from '../budget/hooks';
import { localDate } from '$lib/time';
import { createUpClient, type UpAccount, type UpClient, type UpTransaction } from './client';

type Account = typeof schema.accounts.$inferSelect;
type TransactionRow = typeof schema.transactions.$inferInsert;

/** What the last sync saw of each Up account, for the Up Bank page. */
export const ACCOUNTS_KEY = 'up.accounts';
/** Sync progress: whether the full history has been loaded, when the last sync finished. */
export const STATE_KEY = 'up.sync';

export interface SeenUpAccount {
	id: string;
	name: string;
	type: string;
	ownership: string;
	balanceCents: number;
	createdAt: string;
	accountId: number;
}

export interface SyncState {
	backfillDone?: boolean;
	backfillAt?: number;
	/** Start of the last successful sync (ms). */
	lastOkAt?: number;
}

/** Days re-read on every sync so HELD → SETTLED changes and late arrivals are caught. */
export const OVERLAP_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

export function syncState(): SyncState {
	return getSetting<SyncState>(STATE_KEY) ?? {};
}

/* ---------- mapping ---------- */

/** One Up transaction as a row of the mirror. Amount is signed as Up gives it (negative = out). */
export function mapTransaction(
	t: UpTransaction,
	accountIdByUp: Map<string, number>,
	now = new Date()
): TransactionRow {
	const a = t.attributes;
	const r = t.relationships;
	const upAccountId = r.account.data?.id ?? '';
	return {
		id: t.id,
		accountId: accountIdByUp.get(upAccountId) ?? null,
		upAccountId,
		status: a.status,
		description: a.description,
		rawText: a.rawText,
		message: a.message,
		amountCents: a.amount.valueInBaseUnits,
		date: localDate(new Date(a.createdAt)),
		createdAt: new Date(a.createdAt),
		settledAt: a.settledAt ? new Date(a.settledAt) : null,
		category: r.category?.data?.id ?? null,
		parentCategory: r.parentCategory?.data?.id ?? null,
		tags: (r.tags?.data ?? []).map((tag) => tag.id),
		transferUpAccountId: r.transferAccount?.data?.id ?? null,
		raw: t,
		syncedAt: now
	};
}

/* ---------- accounts ---------- */

/** Up account type → the app's kind and side. */
export function kindFor(upType: string): { kind: 'cash' | 'loan'; side: 'asset' | 'liability' } {
	return upType === 'HOME_LOAN'
		? { kind: 'loan', side: 'liability' }
		: { kind: 'cash', side: 'asset' };
}

/** Up balances are signed; the app keeps liabilities as positive amounts owed. */
export function appCents(upCents: number, side: string): number {
	return side === 'liability' ? -upCents : upCents;
}

/** "💰 Savings 2" → "savings 2", so Up's emoji names meet the plain names used elsewhere. */
export function plainName(name: string): string {
	return name
		.normalize('NFKC')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function link(account: Account, upAccountId: string): Account {
	return db
		.update(schema.accounts)
		.set({ upAccountId, source: 'up', updatedAt: new Date() })
		.where(eq(schema.accounts.id, account.id))
		.returning()
		.get();
}

/**
 * The app account for an Up account: the one already linked to its ID; else an open,
 * unlinked account of the same kind whose name matches (exactly, then ignoring emoji),
 * which gets linked; else a new one. An account linked to another Up ID is never taken.
 */
export function matchAccount(up: { id: string; name: string; type: string }): Account {
	const linked = db
		.select()
		.from(schema.accounts)
		.where(eq(schema.accounts.upAccountId, up.id))
		.get();
	if (linked) return linked;

	const { kind, side } = kindFor(up.type);
	const free = db
		.select()
		.from(schema.accounts)
		.where(
			and(
				eq(schema.accounts.kind, kind),
				isNull(schema.accounts.upAccountId),
				isNull(schema.accounts.closedOn)
			)
		)
		.all();
	const exact = free.filter((a) => a.name.trim().toLowerCase() === up.name.trim().toLowerCase());
	if (exact.length >= 1) return link(exact[0], up.id);
	const plain = free.filter((a) => plainName(a.name) === plainName(up.name));
	if (plain.length === 1) return link(plain[0], up.id);

	const found = findOrCreateAccount({
		name: up.name,
		kind,
		side,
		source: 'up',
		upAccountId: up.id
	});
	if (found.upAccountId === up.id) return found;
	if (!found.upAccountId && !found.closedOn) return link(found, up.id);
	// Same name, but it belongs to another Up account (or is closed): make a separate one.
	const now = new Date();
	return db
		.insert(schema.accounts)
		.values({
			name: up.name.trim(),
			kind,
			side,
			source: 'up',
			upAccountId: up.id,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

/**
 * Point an Up account at a different app account (or a new one). Its live balance and
 * transactions move with it; the old account keeps its history and becomes manual.
 */
export function relinkUpAccount(upAccountId: string, target: number | 'new'): Account {
	const seen = (getSetting<SeenUpAccount[]>(ACCOUNTS_KEY) ?? []).find((a) => a.id === upAccountId);
	if (!seen) throw new Error('That Up account hasn’t been seen by a sync yet');
	return db.transaction((tx) => {
		const now = new Date();
		const old = tx
			.select()
			.from(schema.accounts)
			.where(eq(schema.accounts.upAccountId, upAccountId))
			.get();
		let dest: Account;
		if (target === 'new') {
			const { kind, side } = kindFor(seen.type);
			if (old)
				tx.update(schema.accounts)
					.set({ upAccountId: null, source: 'manual', updatedAt: now })
					.where(eq(schema.accounts.id, old.id))
					.run();
			dest = tx
				.insert(schema.accounts)
				.values({
					name: seen.name,
					kind,
					side,
					source: 'up',
					upAccountId,
					createdAt: now,
					updatedAt: now
				})
				.returning()
				.get();
		} else {
			const t = tx.select().from(schema.accounts).where(eq(schema.accounts.id, target)).get();
			if (!t) throw new Error('No such account');
			if (t.upAccountId && t.upAccountId !== upAccountId)
				throw new Error(`${t.name} is already linked to another Up account`);
			if (old && old.id === t.id) return old;
			if (old)
				tx.update(schema.accounts)
					.set({ upAccountId: null, source: 'manual', updatedAt: now })
					.where(eq(schema.accounts.id, old.id))
					.run();
			dest = tx
				.update(schema.accounts)
				.set({ upAccountId, source: 'up', updatedAt: now })
				.where(eq(schema.accounts.id, t.id))
				.returning()
				.get();
		}
		if (old) tx.delete(schema.liveBalances).where(eq(schema.liveBalances.accountId, old.id)).run();
		tx.insert(schema.liveBalances)
			.values({
				accountId: dest.id,
				valueCents: appCents(seen.balanceCents, dest.side),
				fetchedAt: now
			})
			.onConflictDoUpdate({
				target: schema.liveBalances.accountId,
				set: { valueCents: appCents(seen.balanceCents, dest.side), fetchedAt: now }
			})
			.run();
		tx.update(schema.transactions)
			.set({ accountId: dest.id })
			.where(eq(schema.transactions.upAccountId, upAccountId))
			.run();
		const list = (getSetting<SeenUpAccount[]>(ACCOUNTS_KEY) ?? []).map((a) =>
			a.id === upAccountId ? { ...a, accountId: dest.id } : a
		);
		setSetting(ACCOUNTS_KEY, list);
		return dest;
	});
}

/** Links every Up account and stores its live balance. */
export function applyAccounts(upAccounts: UpAccount[], now = new Date()): Map<string, number> {
	const byUp = new Map<string, number>();
	const seen: SeenUpAccount[] = [];
	db.transaction(() => {
		for (const u of upAccounts) {
			const up = { id: u.id, name: u.attributes.displayName, type: u.attributes.accountType };
			const account = matchAccount(up);
			byUp.set(u.id, account.id);
			const valueCents = appCents(u.attributes.balance.valueInBaseUnits, account.side);
			db.insert(schema.liveBalances)
				.values({ accountId: account.id, valueCents, fetchedAt: now })
				.onConflictDoUpdate({
					target: schema.liveBalances.accountId,
					set: { valueCents, fetchedAt: now }
				})
				.run();
			seen.push({
				...up,
				ownership: u.attributes.ownershipType,
				balanceCents: u.attributes.balance.valueInBaseUnits,
				createdAt: u.attributes.createdAt,
				accountId: account.id
			});
		}
		setSetting(ACCOUNTS_KEY, seen);
	});
	return byUp;
}

/* ---------- transactions ---------- */

export interface UpsertResult {
	added: string[];
	changed: string[];
}

/** Inserts new rows and rewrites rows whose Up record changed. Returns the IDs touched. */
export function upsertTransactions(rows: TransactionRow[]): UpsertResult {
	const added: string[] = [];
	const changed: string[] = [];
	if (rows.length === 0) return { added, changed };
	db.transaction((tx) => {
		const existing = new Map(
			tx
				.select({
					id: schema.transactions.id,
					raw: schema.transactions.raw,
					accountId: schema.transactions.accountId
				})
				.from(schema.transactions)
				.where(
					inArray(
						schema.transactions.id,
						rows.map((r) => r.id)
					)
				)
				.all()
				.map((r) => [r.id, r])
		);
		for (const row of rows) {
			const prev = existing.get(row.id);
			if (!prev) {
				tx.insert(schema.transactions).values(row).run();
				added.push(row.id);
			} else if (
				JSON.stringify(prev.raw) !== JSON.stringify(row.raw) ||
				prev.accountId !== row.accountId
			) {
				const { id, ...rest } = row;
				tx.update(schema.transactions).set(rest).where(eq(schema.transactions.id, id)).run();
				changed.push(row.id);
			}
		}
	});
	return { added, changed };
}

/**
 * Up sometimes settles a hold under a new ID and deletes the HELD one. Any HELD row
 * created inside a window Up has just listed in full, but not in that listing, is gone.
 */
export function removeVanishedHolds(seen: Set<string>, since: Date | null): string[] {
	const where = since
		? and(eq(schema.transactions.status, 'HELD'), gte(schema.transactions.createdAt, since))
		: eq(schema.transactions.status, 'HELD');
	const gone = db
		.select({ id: schema.transactions.id })
		.from(schema.transactions)
		.where(where)
		.all()
		.map((r) => r.id)
		.filter((id) => !seen.has(id));
	if (gone.length)
		db.delete(schema.transactions).where(inArray(schema.transactions.id, gone)).run();
	return gone;
}

/** Where an incremental sync starts: the last sync less the overlap, or the oldest hold if earlier. */
export function windowStart(state: SyncState, now: Date): Date {
	const oldestHeld = db
		.select({ at: min(schema.transactions.createdAt) })
		.from(schema.transactions)
		.where(eq(schema.transactions.status, 'HELD'))
		.get()?.at;
	const newest = db
		.select({ at: sql<number | null>`max(${schema.transactions.createdAt})` })
		.from(schema.transactions)
		.get()?.at;
	const base = state.lastOkAt ?? newest ?? now.getTime();
	let start = base - OVERLAP_DAYS * DAY;
	if (oldestHeld) start = Math.min(start, oldestHeld.getTime() - 60_000);
	return new Date(start);
}

export interface SyncResult {
	accounts: number;
	added: number;
	changed: number;
	removed: number;
	fetched: number;
	full: boolean;
	message: string;
}

export interface SyncOptions {
	client?: UpClient;
	now?: Date;
	/** Re-read the whole history even if it was loaded before. */
	full?: boolean;
	/** Called after each page so long backfills can report progress. */
	onPage?: (fetched: number) => void;
}

let inflight: Promise<SyncResult> | null = null;

/** Accounts, balances and transactions from Up. Concurrent callers share one run. */
export function runUpSync(opts: SyncOptions = {}): Promise<SyncResult> {
	inflight ??= doSync(opts).finally(() => {
		inflight = null;
	});
	return inflight;
}

let progress = 0;

/** Null when no sync is running, else how many transactions it has read so far. */
export function upSyncProgress(): number | null {
	return inflight ? progress : null;
}

async function doSync(opts: SyncOptions): Promise<SyncResult> {
	const client = opts.client ?? createUpClient();
	const now = opts.now ?? new Date();
	const state = syncState();

	const upAccounts = await client.accounts();
	const byUp = applyAccounts(upAccounts, now);

	const full = opts.full || !state.backfillDone;
	const since = full ? null : windowStart(state, now);
	const seen = new Set<string>();
	progress = 0;
	const touched: string[] = [];
	let added = 0;
	let changed = 0;
	for await (const page of client.transactionPages({ since: since?.toISOString() })) {
		const rows = page.map((t) => mapTransaction(t, byUp, now));
		for (const r of rows) seen.add(r.id);
		const res = upsertTransactions(rows);
		added += res.added.length;
		changed += res.changed.length;
		touched.push(...res.added, ...res.changed);
		progress = seen.size;
		opts.onPage?.(seen.size);
	}
	const removed = removeVanishedHolds(seen, since);

	setSetting(STATE_KEY, {
		...state,
		backfillDone: true,
		backfillAt: full ? now.getTime() : state.backfillAt,
		lastOkAt: now.getTime()
	} satisfies SyncState);

	if (touched.length) onTransactionsSynced(touched);

	const parts = [
		`${upAccounts.length} accounts`,
		full
			? `full history read (${seen.size} transactions)`
			: `${seen.size} recent transactions read`,
		`${added} new`,
		`${changed} changed`
	];
	if (removed.length) parts.push(`${removed.length} expired holds removed`);
	return {
		accounts: upAccounts.length,
		added,
		changed,
		removed: removed.length,
		fetched: seen.size,
		full,
		message: parts.join(', ')
	};
}
