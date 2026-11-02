import { describe, expect, it } from 'vitest';
import { db, schema } from '../db';
import type { Breakdown } from './breakdown';
import { setCalculation } from './accounts-admin';
import { editLockedValue, getSnapshot, lockMonth, monthEdits, snapshotValues } from './snapshots';
import { calculatedValue } from './calculated';
import { mergeAccounts } from './accounts-admin';

const now = new Date();
// A year of its own, so a test database left over from an earlier run can't clash.
const Y = String(2100 + Math.floor(Math.random() * 800));
const make = (name: string, kind: string, side: 'asset' | 'liability', source = 'manual') =>
	db
		.insert(schema.accounts)
		.values({ name, kind, side, source, createdAt: now, updatedAt: now })
		.returning()
		.get();
const bal = (accountId: number, date: string, valueCents: number, reestimate = false) =>
	db
		.insert(schema.balances)
		.values({ accountId, date, valueCents, source: 'manual', reestimate, createdAt: now })
		.run();

describe('locking months', () => {
	it('stores values, net worth and a breakdown that adds up, and keeps edit history', () => {
		const cash = make('Test cash', 'cash', 'asset');
		const home = make('Test home', 'property', 'asset');
		const loan = make('Test loan', 'loan', 'liability');
		const share = make('Test share', 'loan', 'liability', 'calculated');
		setCalculation(share.id, 'share_of', { accountId: home.id, shareBp: 2_000 });

		bal(cash.id, `${Y}-01-31`, 1_000_00);
		bal(home.id, `${Y}-01-31`, 400_000_00);
		bal(loan.id, `${Y}-01-31`, 200_000_00);
		lockMonth(`${Y}-01`, [], 'first');
		expect(getSnapshot(`${Y}-01`)!.netWorthCents).toBe(
			1_000_00 + 400_000_00 - 200_000_00 - 80_000_00
		);

		bal(cash.id, `${Y}-02-20`, 1_500_00);
		lockMonth(
			`${Y}-02`,
			[
				{ accountId: loan.id, valueCents: 199_000_00 },
				{ accountId: home.id, valueCents: 410_000_00, reestimate: true }
			],
			'second'
		);
		const feb = getSnapshot(`${Y}-02`)!;
		const b = feb.breakdown as Breakdown;
		expect(b.cash).toBe(500_00);
		expect(b.debt).toBe(1_000_00);
		// Home +10,000 and its 20% share −2,000 are both estimates.
		expect(b.estimates).toBe(8_000_00);
		expect(b.total).toBe(feb.netWorthCents! - getSnapshot(`${Y}-01`)!.netWorthCents!);
		expect(snapshotValues(`${Y}-02`).get(share.id)).toBe(82_000_00);

		// Correcting January changes February's breakdown and is recorded.
		editLockedValue(`${Y}-01`, cash.id, 900_00, 'statement said less');
		expect((getSnapshot(`${Y}-02`)!.breakdown as Breakdown).cash).toBe(600_00);
		expect(monthEdits(`${Y}-01`).map((e) => e.field)).toContain(`value:${cash.id}`);
		expect(() => editLockedValue(`${Y}-01`, cash.id, 1, '')).toThrow();
	});

	it('lets a newer hand entry override a calculation', () => {
		const home = make('Other home', 'property', 'asset');
		const share = make('Other share', 'loan', 'liability', 'calculated');
		setCalculation(share.id, 'share_of', { accountId: home.id, shareBp: 1_000 });
		bal(home.id, `${Y}-03-01`, 300_000_00);
		expect(calculatedValue(share, `${Y}-03-10`)?.valueCents).toBe(30_000_00);
		bal(share.id, `${Y}-03-05`, 31_000_00);
		expect(calculatedValue(share, `${Y}-03-10`)?.valueCents).toBe(31_000_00);
		bal(home.id, `${Y}-03-08`, 320_000_00);
		expect(calculatedValue(share, `${Y}-03-10`)?.valueCents).toBe(32_000_00);
	});

	it('merges two accounts, adding month values together', () => {
		const a = make('Saver A', 'cash', 'asset');
		const b = make('Saver B', 'cash', 'asset');
		bal(a.id, `${Y}-04-30`, 100_00);
		bal(b.id, `${Y}-04-30`, 50_00);
		lockMonth(`${Y}-04`, [], null);
		const before = getSnapshot(`${Y}-04`)!.netWorthCents;
		mergeAccounts(a.id, b.id);
		expect(snapshotValues(`${Y}-04`).get(a.id)).toBe(150_00);
		expect(snapshotValues(`${Y}-04`).has(b.id)).toBe(false);
		expect(getSnapshot(`${Y}-04`)!.netWorthCents).toBe(before);
	});
});
