import { describe, expect, it } from 'vitest';
import { db, schema } from '../db';
import { holdings, priceOn } from './holdings';
import { investValue } from './value';

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
