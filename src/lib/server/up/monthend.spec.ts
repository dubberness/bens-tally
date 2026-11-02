import { vi } from 'vitest';

// Use this file's own empty database (DATA_DIR from test-setup); see the report about sharing.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { setSetting } from '../settings';
import { monthEndDue, monthsToRead, readMonthEnd } from './monthend';
import { upSyncDue } from './jobs';

const at = (local: string) => new Date(`${local}+11:00`);
const created = new Date('2026-01-01T00:00:00Z');

function account(
	name: string,
	source: string,
	values: Partial<typeof schema.accounts.$inferInsert> = {}
) {
	return db
		.insert(schema.accounts)
		.values({
			name,
			kind: 'cash',
			side: 'asset',
			source,
			createdAt: created,
			updatedAt: created,
			...values
		})
		.returning()
		.get();
}

describe('readMonthEnd', () => {
	it('writes one reading per self-updating account, and nothing the second time', () => {
		setSetting('up.sync', { backfillDone: true });
		const up = account('Up saver', 'up', { upAccountId: 'up-x' });
		const manual = account('Typed in', 'manual');
		const closed = account('Old saver', 'up', { upAccountId: 'up-y', closedOn: '2026-10-15' });
		const betashares = account('ETFs', 'betashares', { kind: 'investment' });
		db.insert(schema.liveBalances)
			.values({ accountId: up.id, valueCents: 12_345, fetchedAt: at('2026-11-30T23:58') })
			.run();
		db.insert(schema.liveBalances)
			.values({ accountId: closed.id, valueCents: 1, fetchedAt: at('2026-11-30T23:58') })
			.run();

		const now = at('2026-11-30T23:59');
		const first = readMonthEnd('2026-11', { now });
		expect(first.notYet).toBe(false);
		expect(first.written).toEqual([{ accountId: up.id, name: 'Up saver', valueCents: 12_345 }]);
		// The ETF provider can't answer yet and there is no stored balance.
		expect(first.missing).toEqual(['ETFs']);

		const rows = db
			.select()
			.from(schema.balances)
			.where(and(eq(schema.balances.accountId, up.id), eq(schema.balances.date, '2026-11-30')))
			.all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ source: 'month_end', valueCents: 12_345 });

		const second = readMonthEnd('2026-11', { now });
		expect(second.written).toEqual([]);
		expect(second.existing).toBe(1);
		expect(db.select().from(schema.balances).all()).toHaveLength(1);
		void manual;
		void betashares;
	});

	it("doesn't copy an older stored balance forward as a reading", () => {
		const a = account('Calc', 'calculated', { kind: 'loan', side: 'liability' });
		db.insert(schema.balances)
			.values({
				accountId: a.id,
				date: '2026-09-30',
				valueCents: 500,
				source: 'sheet',
				createdAt: created
			})
			.run();
		const r = readMonthEnd('2026-10', { now: at('2026-11-02T10:00') });
		expect(r.missing).toContain('Calc');
		expect(r.written.find((w) => w.accountId === a.id)).toBeUndefined();
	});

	it('records an empty account as $0, not as missing', () => {
		setSetting('up.sync', { backfillDone: true });
		const empty = account('Empty saver', 'up', { upAccountId: 'up-empty' });
		db.insert(schema.liveBalances)
			.values({ accountId: empty.id, valueCents: 0, fetchedAt: at('2026-11-02T10:00') })
			.run();
		const r = readMonthEnd('2026-10', { now: at('2026-11-02T10:00') });
		expect(r.written).toContainEqual({ accountId: empty.id, name: 'Empty saver', valueCents: 0 });
		expect(r.missing).not.toContain('Empty saver');
	});

	it('refuses a month before its 11:59 pm reading', () => {
		const r = readMonthEnd('2026-11', { now: at('2026-11-30T23:58') });
		expect(r.notYet).toBe(true);
		expect(r.written).toEqual([]);
	});

	it('leaves skipped sources out', () => {
		const r = readMonthEnd('2026-12', { now: at('2027-01-01T10:00'), skipSources: ['up'] });
		expect(r.skipped).toContain('Up saver');
		expect(r.written.find((w) => w.name === 'Up saver')).toBeUndefined();
	});
});

describe('month-end timing', () => {
	it('is due at 11:59 pm on the last day, once', () => {
		const last = at('2026-10-31T23:59');
		expect(monthEndDue(at('2026-11-30T23:58'), last)).toBe(false);
		expect(monthEndDue(at('2026-11-30T23:59'), last)).toBe(true);
		expect(monthEndDue(at('2026-12-01T00:05'), at('2026-11-30T23:59'))).toBe(false);
	});
	it('catches up if the app was down at month end', () => {
		expect(monthEndDue(at('2026-12-03T09:00'), at('2026-10-31T23:59'))).toBe(true);
		expect(monthsToRead(at('2026-12-03T09:00'), new Date('2026-09-30T23:59:00+10:00'))).toEqual([
			'2026-10',
			'2026-11'
		]);
	});
	it('reads only the latest ended month on a first run', () => {
		expect(monthsToRead(at('2026-11-02T10:00'), null)).toEqual(['2026-10']);
	});
});

describe('upSyncDue', () => {
	it('runs every 15 minutes', () => {
		expect(upSyncDue(at('2026-11-02T10:14'), at('2026-11-02T10:00'))).toBe(false);
		expect(upSyncDue(at('2026-11-02T10:15'), at('2026-11-02T10:00'))).toBe(true);
	});
	it('makes a final read at 11:59 pm on the last day', () => {
		expect(upSyncDue(at('2026-11-30T23:59'), at('2026-11-30T23:50'))).toBe(true);
		expect(upSyncDue(at('2026-11-30T23:59'), at('2026-11-30T23:59'))).toBe(false);
		expect(upSyncDue(at('2026-11-29T23:59'), at('2026-11-29T23:50'))).toBe(false);
	});
});
