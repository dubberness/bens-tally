import { describe, expect, it } from 'vitest';
import { db, schema } from '../db';
import { holdings, priceOn } from './holdings';
import { investValue } from './value';
import { disposals, openParcels, taxYears } from './tax';
import { openUnits, RESIDUE_E6 } from './lots';

const now = new Date();

describe('holdings and value', () => {
	const account = db
		.insert(schema.accounts)
		.values({
			name: 'Test funds',
			kind: 'investment',
			side: 'asset',
			source: 'betashares',
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	const fund = db
		.insert(schema.instruments)
		.values({ ticker: 'TST', accountId: account.id, createdAt: now, updatedAt: now })
		.returning()
		.get();
	const trade = (date: string, side: string, units: number, price: number) =>
		db
			.insert(schema.trades)
			.values({
				instrumentId: fund.id,
				date,
				side,
				unitsE6: units * 1e6,
				priceE4: price * 1e4,
				valueCents: Math.round(units * price * 100),
				source: 'manual',
				createdAt: now,
				updatedAt: now
			})
			.run();
	trade('2025-01-10', 'buy', 10, 20);
	trade('2025-03-10', 'buy', 10, 30);
	trade('2025-06-10', 'sell', 5, 40);
	db.insert(schema.prices)
		.values({
			instrumentId: fund.id,
			date: '2025-06-30',
			closeE4: 50 * 1e4,
			source: 'yahoo',
			fetchedAt: now
		})
		.run();

	it('holds what was bought less what was sold, at FIFO cost', () => {
		const [h] = holdings('2025-07-01', account.id);
		expect(h.unitsE6).toBe(15e6);
		expect(h.costCents).toBe(5 * 2000 + 10 * 3000);
		expect(h.valueCents).toBe(15 * 5000);
	});

	it('falls back to the last trade price before any stored price', () => {
		const p = priceOn(fund, '2025-04-01');
		expect(p).toMatchObject({ priceE4: 30 * 1e4, source: 'trade' });
		expect(investValue(account, '2025-04-01')).toMatchObject({
			valueCents: 20 * 3000,
			badge: 'estimate'
		});
	});

	it('values the account from stored prices', () => {
		expect(investValue(account, '2025-07-01')).toMatchObject({ valueCents: 75_000, badge: 'live' });
		expect(investValue(account, '2024-12-31')).toBeNull();
	});
});

describe('rounding residue after a sale', () => {
	// Made-up numbers: 10 units bought, then a sale that leaves 0.0001 of a unit behind.
	const account = db
		.insert(schema.accounts)
		.values({
			name: 'Residue funds',
			kind: 'investment',
			side: 'asset',
			source: 'betashares',
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	const fund = db
		.insert(schema.instruments)
		.values({ ticker: 'RES', accountId: account.id, createdAt: now, updatedAt: now })
		.returning()
		.get();
	const add = (date: string, side: string, units: number, price: number) =>
		db
			.insert(schema.trades)
			.values({
				instrumentId: fund.id,
				date,
				side,
				unitsE6: Math.round(units * 1e6),
				priceE4: price * 1e4,
				valueCents: Math.round(units * price * 100),
				source: 'manual',
				createdAt: now,
				updatedAt: now
			})
			.run();
	add('2025-01-10', 'buy', 10, 20);
	add('2025-03-10', 'sell', 9.9999, 30);

	it('counts as sold out, with no value, no price lookup and no open parcels', () => {
		const [h] = holdings(null, account.id);
		expect(h.unitsE6).toBe(0);
		expect(h.costCents).toBe(0);
		expect(h.price).toBeNull();
		expect(h.valueCents).toBeNull();
		expect(investValue(account, null)).toBeNull();
		expect(openParcels().filter((p) => p.ticker === 'RES')).toEqual([]);
		// The stored trades and the parcel itself are untouched.
		expect(h.lots.parcels).toHaveLength(1);
		expect(h.lots.parcels[0].unitsE6).toBe(100);
	});

	it('leaves the capital gain on the units actually sold as it was', () => {
		const sold = disposals([]).filter((d) => d.ticker === 'RES');
		expect(sold).toHaveLength(1);
		expect(sold[0]).toMatchObject({ unitsE6: 9_999_900, proceedsCents: 30_000, costCents: 20_000 });
		const [year] = taxYears(sold);
		expect(year.totalCents).toBe(10_000);
	});

	it('only forgives a hair of units', () => {
		expect(openUnits(RESIDUE_E6 - 1)).toBe(0);
		expect(openUnits(RESIDUE_E6)).toBe(RESIDUE_E6);
		expect(openUnits(5e6)).toBe(5e6);
	});
});
