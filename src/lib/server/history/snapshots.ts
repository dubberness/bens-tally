import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import { addDays, addMonths, localDate, localMonth, monthEnd } from '$lib/time';
import { db, schema, sqlite } from '../db';
import { accountValue, type Account, type AccountValue } from '../ledger/value';
import { computeBreakdown, type Breakdown, type BreakdownInput } from './breakdown';

export type Snapshot = typeof schema.snapshots.$inferSelect;

/* ---------- accounts ---------- */

export function allAccounts(): Account[] {
	return db
		.select()
		.from(schema.accounts)
		.orderBy(asc(schema.accounts.sortOrder), asc(schema.accounts.id))
		.all();
}

/** An account counts on a date from its opening day until the day before it was closed. */
export function isOpenOn(a: Account, date: string): boolean {
	return (!a.openedOn || a.openedOn <= date) && (!a.closedOn || a.closedOn > date);
}

/** Calculated accounts that are a share of a property account (their changes are estimates). */
export function propertyTiedIds(accounts: Account[] = allAccounts()): Set<number> {
	const byId = new Map(accounts.map((a) => [a.id, a]));
	const out = new Set<number>();
	for (const c of db.select().from(schema.calculations).all()) {
		if (c.kind !== 'share_of') continue;
		const target = byId.get((c.params as { accountId?: number })?.accountId ?? -1);
		if (target?.kind === 'property') out.add(c.accountId);
	}
	return out;
}

/** Every open account's value on a date (null = now). Accounts with no value are left out. */
export function valuesOn(date: string | null, accounts: Account[] = allAccounts()) {
	const on = date ?? localDate();
	const out = new Map<number, AccountValue>();
	for (const a of accounts) {
		if (!isOpenOn(a, on)) continue;
		const v = accountValue(a, date);
		if (v) out.set(a.id, v);
	}
	return out;
}

/** Signed sum: assets add, liabilities subtract. `only` limits it to some accounts. */
export function netWorthOf(
	values: Map<number, number>,
	accounts: Account[],
	only?: (a: Account) => boolean
): number {
	let total = 0;
	for (const a of accounts) {
		const v = values.get(a.id);
		if (v == null || (only && !only(a))) continue;
		total += a.side === 'liability' ? -v : v;
	}
	return total;
}

export const centsOf = (m: Map<number, AccountValue>) =>
	new Map([...m].map(([id, v]) => [id, v.valueCents]));

/* ---------- trades: bought ETFs ---------- */

/**
 * Buys minus sells between two dates (from exclusive, to inclusive), at cost. Buys count
 * their value plus fees; sells count the average cost of the units sold, so a realised
 * gain shows up under markets, not under bought.
 */
export function boughtAtCost(from: string, to: string): number {
	const rows = db
		.select()
		.from(schema.trades)
		.where(lte(schema.trades.date, to))
		.orderBy(asc(schema.trades.date), asc(schema.trades.id))
		.all();
	const held = new Map<number, { units: number; cost: number }>();
	let net = 0;
	for (const t of rows) {
		const h = held.get(t.instrumentId) ?? { units: 0, cost: 0 };
		let delta: number;
		if (t.side === 'buy') {
			delta = t.valueCents + t.feeCents;
			h.units += t.unitsE6;
			h.cost += delta;
		} else {
			const avg = h.units > 0 ? h.cost / h.units : 0;
			const cost = Math.round(avg * Math.min(t.unitsE6, h.units));
			delta = -cost;
			h.units = Math.max(0, h.units - t.unitsE6);
			h.cost = Math.max(0, h.cost - cost);
		}
		held.set(t.instrumentId, h);
		if (t.date > from) net += delta;
	}
	return net;
}

/* ---------- snapshots ---------- */

export function getSnapshot(month: string): Snapshot | undefined {
	return db.select().from(schema.snapshots).where(eq(schema.snapshots.month, month)).get();
}

export function allSnapshots(): Snapshot[] {
	return db.select().from(schema.snapshots).orderBy(asc(schema.snapshots.month)).all();
}

export function lockedSnapshots(): Snapshot[] {
	return allSnapshots().filter((s) => s.status === 'locked');
}

/** The latest locked month strictly before `month` (or the latest of all). */
export function lastLocked(before?: string): Snapshot | undefined {
	const where = before
		? and(eq(schema.snapshots.status, 'locked'), lte(schema.snapshots.month, addMonths(before, -1)))
		: eq(schema.snapshots.status, 'locked');
	return db
		.select()
		.from(schema.snapshots)
		.where(where)
		.orderBy(desc(schema.snapshots.month))
		.limit(1)
		.get();
}

export function nextLocked(after: string): Snapshot | undefined {
	return db
		.select()
		.from(schema.snapshots)
		.where(and(eq(schema.snapshots.status, 'locked'), gt(schema.snapshots.month, after)))
		.orderBy(asc(schema.snapshots.month))
		.limit(1)
		.get();
}

export function snapshotValues(month: string): Map<number, number> {
	return new Map(
		db
			.select()
			.from(schema.snapshotValues)
			.where(eq(schema.snapshotValues.month, month))
			.all()
			.map((r) => [r.accountId, r.valueCents])
	);
}

/** Accounts whose value changed through a balance marked as a re-estimate in (from, to]. */
function reestimatedIds(from: string | null, to: string): Set<number> {
	const rows = db
		.select({ accountId: schema.balances.accountId, date: schema.balances.date })
		.from(schema.balances)
		.where(and(eq(schema.balances.reestimate, true), lte(schema.balances.date, to)))
		.all();
	return new Set(rows.filter((r) => !from || r.date > from).map((r) => r.accountId));
}

/** The breakdown between two sets of values. */
export function breakdownBetween(opts: {
	prevMonth: string | null;
	prev: Map<number, number>;
	curr: Map<number, number>;
	bought: number;
	boughtSource?: Breakdown['boughtSource'];
	/** Period, for re-estimate flags: (from, to]. */
	from: string | null;
	to: string;
	accounts?: Account[];
}): Breakdown {
	const accounts = opts.accounts ?? allAccounts();
	const tied = propertyTiedIds(accounts);
	const re = reestimatedIds(opts.from, opts.to);
	const inputs: BreakdownInput[] = [];
	for (const a of accounts) {
		const prev = opts.prev.get(a.id) ?? null;
		const curr = opts.curr.get(a.id) ?? null;
		if (prev == null && curr == null) continue;
		inputs.push({
			id: a.id,
			name: a.name,
			kind: a.kind,
			side: a.side,
			tiedToProperty: tied.has(a.id),
			reestimate: re.has(a.id),
			prev,
			curr
		});
	}
	return computeBreakdown(inputs, opts.bought, opts.boughtSource ?? 'trades', opts.prevMonth);
}

/** Values and change for a month, worked out now (for the open month and the Close preview). */
export function computeMonth(month: string, overrides?: Map<number, number>) {
	const today = localDate();
	const end = monthEnd(month);
	const date = end < today ? end : today;
	const accounts = allAccounts();
	const live = valuesOn(date === today && end > today ? null : date, accounts);
	const values = centsOf(live);
	for (const [id, v] of overrides ?? []) values.set(id, v);
	const prev = lastLocked(month);
	const prevEnd = prev ? monthEnd(prev.month) : null;
	const breakdown = prev
		? breakdownBetween({
				prevMonth: prev.month,
				prev: snapshotValues(prev.month),
				curr: values,
				bought: boughtAtCost(prevEnd!, date),
				from: prevEnd,
				to: date,
				accounts
			})
		: null;
	return {
		date,
		values,
		live,
		netWorth: netWorthOf(values, accounts),
		breakdown,
		prev,
		accounts
	};
}

function writeValues(month: string, values: Map<number, number>) {
	db.delete(schema.snapshotValues).where(eq(schema.snapshotValues.month, month)).run();
	const rows = [...values].map(([accountId, valueCents]) => ({ month, accountId, valueCents }));
	if (rows.length) db.insert(schema.snapshotValues).values(rows).run();
}

/** Create or refresh the open snapshot of a month (never touches a locked one). */
export function refreshOpenMonth(month: string = localMonth(), origin: 'app' | 'sheet' = 'app') {
	const existing = getSnapshot(month);
	if (existing?.status === 'locked') return existing;
	const c = computeMonth(month);
	const now = new Date();
	sqlite.transaction(() => {
		db.insert(schema.snapshots)
			.values({
				month,
				status: 'open',
				netWorthCents: c.netWorth,
				breakdown: c.breakdown,
				origin: existing?.origin ?? origin,
				note: existing?.note ?? null,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: schema.snapshots.month,
				set: { netWorthCents: c.netWorth, breakdown: c.breakdown, updatedAt: now }
			})
			.run();
		writeValues(month, c.values);
	})();
	return getSnapshot(month)!;
}

export interface CloseEntry {
	accountId: number;
	valueCents: number;
	reestimate?: boolean;
}

/**
 * Lock a month: typed values become balances dated the last day of the month, then every
 * open account's value on that day is stored with the net worth and the breakdown.
 */
export function lockMonth(month: string, entries: CloseEntry[], note: string | null) {
	const existing = getSnapshot(month);
	if (existing?.status === 'locked') throw new Error(`${month} is already locked`);
	const end = monthEnd(month);
	const now = new Date();
	sqlite.transaction(() => {
		for (const e of entries) {
			const current = db
				.select()
				.from(schema.balances)
				.where(and(eq(schema.balances.accountId, e.accountId), eq(schema.balances.date, end)))
				.orderBy(desc(schema.balances.id))
				.get();
			if (current && current.valueCents === e.valueCents) continue;
			db.insert(schema.balances)
				.values({
					accountId: e.accountId,
					date: end,
					valueCents: e.valueCents,
					source: 'manual',
					reestimate: !!e.reestimate,
					createdAt: now
				})
				.run();
		}
		const accounts = allAccounts();
		const values = centsOf(valuesOn(end, accounts));
		const prev = lastLocked(month);
		const prevEnd = prev ? monthEnd(prev.month) : null;
		const breakdown = prev
			? breakdownBetween({
					prevMonth: prev.month,
					prev: snapshotValues(prev.month),
					curr: values,
					bought: boughtAtCost(prevEnd!, end),
					from: prevEnd,
					to: end,
					accounts
				})
			: null;
		const row = {
			status: 'locked',
			netWorthCents: netWorthOf(values, accounts),
			breakdown,
			note: note?.trim() || null,
			lockedAt: now,
			updatedAt: now
		};
		db.insert(schema.snapshots)
			.values({ month, origin: 'app', createdAt: now, ...row })
			.onConflictDoUpdate({ target: schema.snapshots.month, set: row })
			.run();
		writeValues(month, values);
		// The month after keeps measuring against the latest lock.
		const next = nextLocked(month);
		if (next) recompute(next.month);
	})();
	return getSnapshot(month)!;
}

/** Recompute a locked month's net worth and breakdown from its stored values. */
export function recompute(month: string) {
	const snap = getSnapshot(month);
	if (!snap) return;
	const accounts = allAccounts();
	const values = snapshotValues(month);
	const prev = lastLocked(month);
	const old = snap.breakdown as Breakdown | null;
	let breakdown: Breakdown | null = null;
	if (prev) {
		const prevEnd = monthEnd(prev.month);
		const end = monthEnd(month);
		const sheetBought = old?.boughtSource === 'sheet' && old.prevMonth === prev.month;
		breakdown = breakdownBetween({
			prevMonth: prev.month,
			prev: snapshotValues(prev.month),
			curr: values,
			bought: sheetBought ? old!.bought : boughtAtCost(prevEnd, end),
			boughtSource: sheetBought ? 'sheet' : 'trades',
			from: prevEnd,
			to: end,
			accounts
		});
	}
	db.update(schema.snapshots)
		.set({ netWorthCents: netWorthOf(values, accounts), breakdown, updatedAt: new Date() })
		.where(eq(schema.snapshots.month, month))
		.run();
}

function recordEdit(
	month: string,
	field: string,
	oldValue: unknown,
	newValue: unknown,
	reason: string | null
) {
	db.insert(schema.edits)
		.values({
			entity: 'snapshot',
			entityKey: month,
			field,
			oldValue: oldValue == null ? null : String(oldValue),
			newValue: newValue == null ? null : String(newValue),
			reason: reason?.trim() || null,
			at: new Date()
		})
		.run();
}

/** Change one account's value in a locked month; the reason is kept in its history. */
export function editLockedValue(
	month: string,
	accountId: number,
	valueCents: number | null,
	reason: string
) {
	const snap = getSnapshot(month);
	if (!snap || snap.status !== 'locked') throw new Error(`${month} isn't locked`);
	if (!reason.trim()) throw new Error('Say why the number changed');
	const values = snapshotValues(month);
	const old = values.get(accountId) ?? null;
	if (old === valueCents) return;
	sqlite.transaction(() => {
		const oldNet = snap.netWorthCents;
		if (valueCents == null) {
			db.delete(schema.snapshotValues)
				.where(
					and(
						eq(schema.snapshotValues.month, month),
						eq(schema.snapshotValues.accountId, accountId)
					)
				)
				.run();
		} else {
			db.insert(schema.snapshotValues)
				.values({ month, accountId, valueCents })
				.onConflictDoUpdate({
					target: [schema.snapshotValues.month, schema.snapshotValues.accountId],
					set: { valueCents }
				})
				.run();
		}
		recordEdit(month, `value:${accountId}`, old, valueCents, reason);
		recompute(month);
		const next = nextLocked(month);
		if (next) recompute(next.month);
		recordEdit(month, 'net_worth', oldNet, getSnapshot(month)!.netWorthCents, reason);
	})();
}

/** Change a month's note. Notes on locked months keep their history too. */
export function editNote(month: string, note: string, reason: string | null = null) {
	const snap = getSnapshot(month);
	if (!snap) throw new Error(`No snapshot for ${month}`);
	const clean = note.trim() || null;
	if (clean === snap.note) return;
	sqlite.transaction(() => {
		db.update(schema.snapshots)
			.set({ note: clean, updatedAt: new Date() })
			.where(eq(schema.snapshots.month, month))
			.run();
		if (snap.status === 'locked') recordEdit(month, 'note', snap.note, clean, reason);
	})();
}

export function monthEdits(month: string) {
	return db
		.select()
		.from(schema.edits)
		.where(and(eq(schema.edits.entity, 'snapshot'), eq(schema.edits.entityKey, month)))
		.orderBy(desc(schema.edits.at), desc(schema.edits.id))
		.all();
}

/**
 * The month waiting to be closed, if any: the one after the last locked month (or last
 * month when nothing is locked yet), once its last day has come.
 */
export function monthToClose(
	today: string = localDate()
): { month: string; overdueDays: number } | null {
	const current = today.slice(0, 7);
	const last = lastLocked();
	let month: string;
	if (last) month = addMonths(last.month, 1);
	else {
		if (!db.select({ id: schema.accounts.id }).from(schema.accounts).limit(1).get()) return null;
		month = today === monthEnd(current) ? current : addMonths(current, -1);
	}
	if (month > current) return null;
	if (month === current && today !== monthEnd(current)) return null;
	const end = monthEnd(month);
	const overdue = Math.max(0, Math.round((Date.parse(today) - Date.parse(end)) / 86_400_000));
	return { month, overdueDays: overdue };
}

/** First day after a month, for closing an account "at the end of" it. */
export const dayAfterMonth = (month: string) => addDays(monthEnd(month), 1);
