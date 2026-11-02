import { asc, eq, sql } from 'drizzle-orm';
import { localDate } from '$lib/time';
import { db, schema, sqlite } from '../db';
import type { Account } from '../ledger/value';
import { getCalculation } from './calculated';
import type { CalculationKind } from './schedule';

/* Changing accounts and their entries, from the account page and Manage › Accounts. */

export const KINDS = ['cash', 'investment', 'super', 'property', 'loan', 'other'] as const;
export const SIDES = ['asset', 'liability'] as const;
export const SOURCES = ['manual', 'calculated', 'up', 'betashares'] as const;

export function getAccount(id: number): Account | undefined {
	return db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
}

export function balancesOf(accountId: number) {
	return db
		.select()
		.from(schema.balances)
		.where(eq(schema.balances.accountId, accountId))
		.orderBy(sql`${schema.balances.date} desc`, sql`${schema.balances.id} desc`)
		.all();
}

function recordEdit(
	entity: string,
	key: string,
	field: string,
	oldV: unknown,
	newV: unknown,
	reason?: string | null
) {
	db.insert(schema.edits)
		.values({
			entity,
			entityKey: key,
			field,
			oldValue: oldV == null ? null : String(oldV),
			newValue: newV == null ? null : String(newV),
			reason: reason ?? null,
			at: new Date()
		})
		.run();
}

export interface BalanceInput {
	date: string;
	valueCents: number;
	reestimate?: boolean;
	note?: string | null;
}

export function addBalance(accountId: number, b: BalanceInput) {
	return db
		.insert(schema.balances)
		.values({
			accountId,
			date: b.date,
			valueCents: b.valueCents,
			source: 'manual',
			reestimate: !!b.reestimate,
			note: b.note?.trim() || null,
			createdAt: new Date()
		})
		.returning()
		.get();
}

export function updateBalance(id: number, b: BalanceInput) {
	const old = db.select().from(schema.balances).where(eq(schema.balances.id, id)).get();
	if (!old) throw new Error('That entry is gone');
	db.update(schema.balances)
		.set({
			date: b.date,
			valueCents: b.valueCents,
			reestimate: !!b.reestimate,
			note: b.note?.trim() || null
		})
		.where(eq(schema.balances.id, id))
		.run();
	if (old.valueCents !== b.valueCents || old.date !== b.date)
		recordEdit(
			'balance',
			String(id),
			'value',
			`${old.date} ${old.valueCents}`,
			`${b.date} ${b.valueCents}`
		);
	return old.accountId;
}

export function deleteBalance(id: number) {
	const old = db.select().from(schema.balances).where(eq(schema.balances.id, id)).get();
	if (!old) return null;
	db.delete(schema.balances).where(eq(schema.balances.id, id)).run();
	recordEdit('balance', String(id), 'deleted', `${old.date} ${old.valueCents}`, null);
	return old.accountId;
}

export type AccountInput = Pick<
	Account,
	| 'name'
	| 'kind'
	| 'side'
	| 'source'
	| 'colour'
	| 'icon'
	| 'investable'
	| 'closeOrder'
	| 'updateEveryDays'
	| 'note'
	| 'openedOn'
>;

export function createAccount(v: AccountInput) {
	const now = new Date();
	const max = db
		.select({ m: sql<number>`coalesce(max(${schema.accounts.sortOrder}), 0)` })
		.from(schema.accounts)
		.get();
	return db
		.insert(schema.accounts)
		.values({
			...v,
			name: v.name.trim(),
			sortOrder: (max?.m ?? 0) + 10,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
}

export function updateAccount(id: number, v: Partial<AccountInput>) {
	db.update(schema.accounts)
		.set({ ...v, ...(v.name ? { name: v.name.trim() } : {}), updatedAt: new Date() })
		.where(eq(schema.accounts.id, id))
		.run();
}

/** Close from a date: the account stops counting that day, its history stays. */
export function closeAccount(id: number, on: string = localDate()) {
	db.update(schema.accounts)
		.set({ closedOn: on, updatedAt: new Date() })
		.where(eq(schema.accounts.id, id))
		.run();
}

export function reopenAccount(id: number) {
	db.update(schema.accounts)
		.set({ closedOn: null, updatedAt: new Date() })
		.where(eq(schema.accounts.id, id))
		.run();
}

/** Move an account one place up or down in the list. */
export function moveAccount(
	id: number,
	dir: -1 | 1,
	field: 'sortOrder' | 'closeOrder' = 'sortOrder'
) {
	const col = schema.accounts[field];
	const list = db
		.select()
		.from(schema.accounts)
		.where(field === 'closeOrder' ? sql`${col} is not null` : undefined)
		.orderBy(asc(col), asc(schema.accounts.id))
		.all();
	const i = list.findIndex((a) => a.id === id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= list.length) return;
	[list[i], list[j]] = [list[j], list[i]];
	sqlite.transaction(() => {
		list.forEach((a, n) =>
			db
				.update(schema.accounts)
				.set({ [field]: (n + 1) * 10 })
				.where(eq(schema.accounts.id, a.id))
				.run()
		);
	})();
}

export function setCalculation(accountId: number, kind: CalculationKind | null, params: unknown) {
	if (!kind) {
		db.delete(schema.calculations).where(eq(schema.calculations.accountId, accountId)).run();
		return;
	}
	db.insert(schema.calculations)
		.values({ accountId, kind, params, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: schema.calculations.accountId,
			set: { kind, params, updatedAt: new Date() }
		})
		.run();
}

export { getCalculation };

/**
 * Merge `removeId` into `keepId`: balances, month values (added together where both have
 * one), transactions, pay splits, budget lines, funds, events and calculations that point
 * at it move to the kept account; then the other one is deleted.
 */
export function mergeAccounts(keepId: number, removeId: number) {
	if (keepId === removeId) throw new Error('Pick two different accounts');
	const keep = getAccount(keepId);
	const gone = getAccount(removeId);
	if (!keep || !gone) throw new Error('One of those accounts is gone');
	if (keep.side !== gone.side)
		throw new Error('Only accounts on the same side (both owned or both owed) can be merged');
	sqlite.transaction(() => {
		db.update(schema.balances)
			.set({ accountId: keepId })
			.where(eq(schema.balances.accountId, removeId))
			.run();
		const theirs = db
			.select()
			.from(schema.snapshotValues)
			.where(eq(schema.snapshotValues.accountId, removeId))
			.all();
		for (const v of theirs) {
			db.insert(schema.snapshotValues)
				.values({ month: v.month, accountId: keepId, valueCents: v.valueCents })
				.onConflictDoUpdate({
					target: [schema.snapshotValues.month, schema.snapshotValues.accountId],
					set: { valueCents: sql`${schema.snapshotValues.valueCents} + ${v.valueCents}` }
				})
				.run();
		}
		db.delete(schema.snapshotValues).where(eq(schema.snapshotValues.accountId, removeId)).run();
		db.update(schema.transactions)
			.set({ accountId: keepId })
			.where(eq(schema.transactions.accountId, removeId))
			.run();
		db.update(schema.paySplits)
			.set({ accountId: keepId })
			.where(eq(schema.paySplits.accountId, removeId))
			.run();
		db.update(schema.budgetLines)
			.set({ saverAccountId: keepId })
			.where(eq(schema.budgetLines.saverAccountId, removeId))
			.run();
		db.update(schema.instruments)
			.set({ accountId: keepId })
			.where(eq(schema.instruments.accountId, removeId))
			.run();
		db.update(schema.events)
			.set({ accountId: keepId })
			.where(eq(schema.events.accountId, removeId))
			.run();
		// Shares of the removed account now follow the kept one.
		for (const c of db
			.select()
			.from(schema.calculations)
			.where(eq(schema.calculations.kind, 'share_of'))
			.all()) {
			const p = c.params as { accountId?: number };
			if (p?.accountId === removeId)
				db.update(schema.calculations)
					.set({ params: { ...p, accountId: keepId }, updatedAt: new Date() })
					.where(eq(schema.calculations.accountId, c.accountId))
					.run();
		}
		const live = db
			.select()
			.from(schema.liveBalances)
			.where(eq(schema.liveBalances.accountId, removeId))
			.get();
		const keepLive = db
			.select()
			.from(schema.liveBalances)
			.where(eq(schema.liveBalances.accountId, keepId))
			.get();
		if (live && !keepLive)
			db.update(schema.liveBalances)
				.set({ accountId: keepId })
				.where(eq(schema.liveBalances.accountId, removeId))
				.run();
		const upId = !keep.upAccountId ? gone.upAccountId : null;
		db.delete(schema.accounts).where(eq(schema.accounts.id, removeId)).run();
		const patch: Partial<Account> = { updatedAt: new Date() };
		if (upId) patch.upAccountId = upId;
		if (gone.openedOn && (!keep.openedOn || gone.openedOn < keep.openedOn))
			patch.openedOn = gone.openedOn;
		db.update(schema.accounts).set(patch).where(eq(schema.accounts.id, keepId)).run();
		db.insert(schema.edits)
			.values({
				entity: 'account',
				entityKey: String(keepId),
				field: 'merged',
				oldValue: gone.name,
				newValue: keep.name,
				reason: null,
				at: new Date()
			})
			.run();
	})();
}
