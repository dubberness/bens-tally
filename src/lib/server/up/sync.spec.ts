import { vi } from 'vitest';

// Use this file's own empty database (DATA_DIR from test-setup); see the report about sharing.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { setSetting } from '../settings';
import type { UpAccount, UpClient, UpTransaction } from './client';
import {
	mapTransaction,
	matchAccount,
	plainName,
	relinkUpAccount,
	runUpSync,
	STATE_KEY
} from './sync';
import { upValue } from './value';
import { listTransactions } from './transactions';

const now = new Date('2026-11-02T10:00:00+11:00');

function upAccount(id: string, name: string, cents: number, type = 'SAVER'): UpAccount {
	return {
		type: 'accounts',
		id,
		attributes: {
			displayName: name,
			accountType: type,
			ownershipType: 'INDIVIDUAL',
			balance: { currencyCode: 'AUD', value: (cents / 100).toFixed(2), valueInBaseUnits: cents },
			createdAt: '2024-01-01T09:00:00+11:00'
		}
	};
}

function upTx(
	id: string,
	account: string,
	cents: number,
	createdAt: string,
	opts: {
		status?: 'HELD' | 'SETTLED';
		roundUp?: number;
		transfer?: string;
		category?: string;
		tags?: string[];
	} = {}
): UpTransaction {
	const money = (c: number) => ({
		currencyCode: 'AUD',
		value: (c / 100).toFixed(2),
		valueInBaseUnits: c
	});
	return {
		type: 'transactions',
		id,
		attributes: {
			status: opts.status ?? 'SETTLED',
			rawText: null,
			description: `Shop ${id}`,
			message: null,
			amount: money(cents),
			foreignAmount: null,
			roundUp: opts.roundUp ? { amount: money(opts.roundUp), boostPortion: null } : null,
			cashback: null,
			settledAt: opts.status === 'HELD' ? null : createdAt,
			createdAt
		},
		relationships: {
			account: { data: { type: 'accounts', id: account } },
			transferAccount: { data: opts.transfer ? { type: 'accounts', id: opts.transfer } : null },
			category: { data: opts.category ? { type: 'categories', id: opts.category } : null },
			parentCategory: { data: opts.category ? { type: 'categories', id: 'parent' } : null },
			tags: { data: (opts.tags ?? []).map((t) => ({ type: 'tags', id: t })) }
		}
	};
}

/** A stand-in for Up: newest first, honours `since`, 2 per page. */
function fakeUp(state: { accounts: UpAccount[]; txs: UpTransaction[] }) {
	const calls: { since?: string }[] = [];
	const client = {
		accounts: async () => state.accounts,
		transactionPages: async function* (q: { since?: string } = {}) {
			calls.push(q);
			const list = state.txs
				.filter((t) => !q.since || new Date(t.attributes.createdAt) >= new Date(q.since))
				.sort((a, b) => b.attributes.createdAt.localeCompare(a.attributes.createdAt));
			for (let i = 0; i < list.length; i += 2) yield list.slice(i, i + 2);
		}
	};
	return { client: client as unknown as UpClient, calls };
}

function reset() {
	db.delete(schema.transactions).run();
	db.delete(schema.liveBalances).run();
	db.delete(schema.balances).run();
	db.delete(schema.accounts).run();
	setSetting(STATE_KEY, {});
}

function addAccount(name: string, values: Partial<typeof schema.accounts.$inferInsert> = {}) {
	return db
		.insert(schema.accounts)
		.values({
			name,
			kind: 'cash',
			side: 'asset',
			source: 'manual',
			createdAt: now,
			updatedAt: now,
			...values
		})
		.returning()
		.get();
}

describe('mapTransaction', () => {
	it('maps an Up transaction to a mirror row', () => {
		const t = upTx('t1', 'up-a', -1250, '2026-10-31T23:30:00+11:00', {
			roundUp: -50,
			transfer: 'up-b',
			category: 'groceries',
			tags: ['Lunch']
		});
		const row = mapTransaction(t, new Map([['up-a', 7]]), now);
		expect(row).toMatchObject({
			id: 't1',
			accountId: 7,
			upAccountId: 'up-a',
			status: 'SETTLED',
			description: 'Shop t1',
			amountCents: -1250,
			date: '2026-10-31',
			category: 'groceries',
			parentCategory: 'parent',
			tags: ['Lunch'],
			transferUpAccountId: 'up-b'
		});
		expect(row.createdAt).toEqual(new Date('2026-10-31T12:30:00Z'));
		expect(row.raw).toBe(t);
	});
	it('uses the Hobart date of createdAt, not UTC', () => {
		// 13:30 UTC on the 31st is 00:30 on 1 November in Hobart.
		const row = mapTransaction(upTx('t2', 'x', -1, '2026-10-31T13:30:00Z'), new Map(), now);
		expect(row.date).toBe('2026-11-01');
		expect(row.accountId).toBeNull();
	});
});

describe('account matching', () => {
	beforeEach(reset);

	it('links an unlinked account with the same name', () => {
		const a = addAccount('Sample fund');
		const m = matchAccount({ id: 'up-1', name: 'sample FUND', type: 'SAVER' });
		expect(m.id).toBe(a.id);
		expect(m.upAccountId).toBe('up-1');
		expect(m.source).toBe('up');
	});

	it('matches names that differ only by emoji', () => {
		expect(plainName('💰 Savings 2')).toBe('savings 2');
		const a = addAccount('Holidays');
		expect(matchAccount({ id: 'up-2', name: '✈️ Holidays', type: 'SAVER' }).id).toBe(a.id);
	});

	it('never takes an account linked to another Up account', () => {
		const a = addAccount('Bills', { upAccountId: 'up-other', source: 'up' });
		const m = matchAccount({ id: 'up-3', name: 'Bills', type: 'SAVER' });
		expect(m.id).not.toBe(a.id);
		expect(m.upAccountId).toBe('up-3');
		const again = db.select().from(schema.accounts).where(eq(schema.accounts.id, a.id)).get();
		expect(again?.upAccountId).toBe('up-other');
	});

	it('finds the account by Up ID even after a rename', () => {
		const a = addAccount('Renamed by hand', { upAccountId: 'up-4', source: 'up' });
		expect(matchAccount({ id: 'up-4', name: 'Original', type: 'SAVER' }).id).toBe(a.id);
	});

	it('makes a home loan a liability', () => {
		const m = matchAccount({ id: 'up-5', name: 'Home', type: 'HOME_LOAN' });
		expect(m).toMatchObject({ kind: 'loan', side: 'liability', source: 'up' });
	});
});

describe('runUpSync', () => {
	beforeEach(reset);

	const accounts = () => [
		upAccount('up-s', 'Spending', 7_000, 'TRANSACTIONAL'),
		upAccount('up-v', 'Saver', 50_000)
	];
	const history = () => [
		upTx('a', 'up-s', 140_000, '2026-08-15T09:00:00+10:00'),
		upTx('b', 'up-s', -40_000, '2026-08-20T09:00:00+10:00', { transfer: 'up-v' }),
		upTx('c', 'up-v', 40_000, '2026-08-20T09:00:00+10:00', { transfer: 'up-s' }),
		upTx('d', 'up-s', -2_950, '2026-09-30T23:50:00+10:00', { roundUp: -50 }),
		upTx('e', 'up-v', 50, '2026-09-30T23:50:00+10:00'),
		upTx('f', 'up-s', -50_000, '2026-10-05T12:00:00+11:00'),
		upTx('g', 'up-v', 9_950, '2026-10-31T23:59:00+11:00'),
		upTx('h', 'up-s', -40_000, '2026-11-01T08:00:00+11:00', { status: 'HELD' })
	];

	it('loads everything, then rebuilds past balances exactly', async () => {
		const up = fakeUp({ accounts: accounts(), txs: history() });
		const r = await runUpSync({ client: up.client, now });
		expect(r).toMatchObject({ full: true, added: 8, changed: 0, removed: 0 });
		expect(db.select().from(schema.transactions).all()).toHaveLength(8);

		const spending = matchAccount({ id: 'up-s', name: 'Spending', type: 'TRANSACTIONAL' });
		const saver = matchAccount({ id: 'up-v', name: 'Saver', type: 'SAVER' });
		// Spending: +1400 −400 −29.50 −0.50 round-up −500 −400 held = 70.00 live.
		expect(upValue(spending, null)?.valueCents).toBe(7_000);
		expect(upValue(spending, '2026-10-31')?.valueCents).toBe(47_000);
		expect(upValue(spending, '2026-09-30')).toMatchObject({
			valueCents: 97_000,
			asOf: '2026-09-30'
		});
		expect(upValue(spending, '2026-08-31')?.valueCents).toBe(100_000);
		expect(upValue(spending, '2026-07-31')?.valueCents).toBe(0);
		expect(upValue(saver, '2026-10-31')?.valueCents).toBe(50_000);
		expect(upValue(saver, '2026-10-30')?.valueCents).toBe(40_050);
	});

	it('changes nothing when run twice', async () => {
		const up = fakeUp({ accounts: accounts(), txs: history() });
		await runUpSync({ client: up.client, now });
		const before = db.select().from(schema.transactions).all();
		const r = await runUpSync({ client: up.client, now: new Date(now.getTime() + 15 * 60_000) });
		expect(r).toMatchObject({ full: false, added: 0, changed: 0, removed: 0 });
		const after = db.select().from(schema.transactions).all();
		expect(after.map((t) => [t.id, t.status, t.amountCents])).toEqual(
			before.map((t) => [t.id, t.status, t.amountCents])
		);
		expect(db.select().from(schema.accounts).all()).toHaveLength(2);
	});

	it('reads only a recent window once the history is loaded, reaching back to the oldest hold', async () => {
		const up = fakeUp({ accounts: accounts(), txs: history() });
		await runUpSync({ client: up.client, now });
		await runUpSync({ client: up.client, now: new Date(now.getTime() + 15 * 60_000) });
		const since = new Date(up.calls[1].since!);
		// The hold 'h' was created 1 Nov 8 am; the window must include it.
		expect(since.getTime()).toBeLessThanOrEqual(new Date('2026-11-01T08:00:00+11:00').getTime());
		expect(since.getTime()).toBeGreaterThan(new Date('2026-10-20T00:00:00+11:00').getTime());
	});

	it('handles a hold that settles under the same ID', async () => {
		const state = { accounts: accounts(), txs: history() };
		const up = fakeUp(state);
		await runUpSync({ client: up.client, now });
		state.txs = state.txs.map((t) =>
			t.id === 'h' ? upTx('h', 'up-s', -39_500, '2026-11-01T08:00:00+11:00') : t
		);
		const r = await runUpSync({ client: up.client, now: new Date(now.getTime() + 15 * 60_000) });
		expect(r).toMatchObject({ changed: 1, removed: 0 });
		const h = db.select().from(schema.transactions).where(eq(schema.transactions.id, 'h')).get();
		expect(h).toMatchObject({ status: 'SETTLED', amountCents: -39_500 });
	});

	it('removes a hold Up replaced with a new settled transaction', async () => {
		const state = { accounts: accounts(), txs: history() };
		const up = fakeUp(state);
		await runUpSync({ client: up.client, now });
		state.txs = [
			...state.txs.filter((t) => t.id !== 'h'),
			upTx('h2', 'up-s', -40_000, '2026-11-02T09:00:00+11:00')
		];
		const r = await runUpSync({ client: up.client, now: new Date(now.getTime() + 15 * 60_000) });
		expect(r).toMatchObject({ added: 1, removed: 1 });
		const ids = db
			.select({ id: schema.transactions.id })
			.from(schema.transactions)
			.all()
			.map((t) => t.id);
		expect(ids).toContain('h2');
		expect(ids).not.toContain('h');
	});

	it('moves balances and transactions when an Up account is re-linked', async () => {
		const up = fakeUp({ accounts: accounts(), txs: history() });
		await runUpSync({ client: up.client, now });
		const target = addAccount('Emergency fund');
		const before = matchAccount({ id: 'up-v', name: 'Saver', type: 'SAVER' });
		relinkUpAccount('up-v', target.id);
		const moved = listTransactions({ accountId: target.id });
		expect(moved.total).toBe(3);
		const old = db.select().from(schema.accounts).where(eq(schema.accounts.id, before.id)).get();
		expect(old).toMatchObject({ upAccountId: null, source: 'manual' });
		const t = db.select().from(schema.accounts).where(eq(schema.accounts.id, target.id)).get()!;
		expect(upValue(t, null)?.valueCents).toBe(50_000);
		// A later sync keeps the new link.
		await runUpSync({ client: up.client, now: new Date(now.getTime() + 15 * 60_000) });
		expect(matchAccount({ id: 'up-v', name: 'Saver', type: 'SAVER' }).id).toBe(target.id);
	});

	it('lists transactions newest first with filters', async () => {
		const up = fakeUp({ accounts: accounts(), txs: history() });
		await runUpSync({ client: up.client, now });
		const all = listTransactions();
		expect(all.total).toBe(8);
		expect(all.rows[0].id).toBe('h');
		expect(all.rows[0].status).toBe('HELD');
		expect(listTransactions({ month: '2026-08' }).total).toBe(3);
		expect(listTransactions({ search: '29.50' }).rows.map((r) => r.id)).toEqual(['d']);
		expect(listTransactions({ search: 'shop f' }).rows.map((r) => r.id)).toEqual(['f']);
		const d = listTransactions({ search: '29.50' }).rows[0];
		expect(d.roundUpCents).toBe(-50);
		expect(d.assignment).toBeNull();
		expect(listTransactions({ limit: 3, offset: 3 }).rows).toHaveLength(3);
	});
});
