import { describe, expect, it } from 'vitest';
import { db, schema } from '../db';
import {
	addDistribution,
	addTrade,
	deleteTrade,
	editsOf,
	findTrade,
	readDistributionForm,
	readTradeForm,
	updateTrade
} from './records';

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const now = new Date();

describe('trade and distribution forms', () => {
	it('works out the value from units and price', () => {
		const v = readTradeForm(
			form({ instrumentId: '1', date: '2026-03-02', side: 'buy', units: '10.5', price: '41.61' })
		);
		expect(v).toMatchObject({ unitsE6: 10_500_000, priceE4: 416_100, valueCents: 43_691 });
	});

	it('works out the price from the value', () => {
		const v = readTradeForm(
			form({ instrumentId: '1', date: '2026-03-02', side: 'sell', units: '4', value: '1,000' })
		);
		expect(v).toMatchObject({ side: 'sell', priceE4: 2_500_000, valueCents: 100_000 });
	});

	it('says what is missing', () => {
		expect(readTradeForm(form({ instrumentId: '1', date: '2026-03-02', side: 'buy' }))).toBe(
			'Units must be a positive number.'
		);
		expect(
			readTradeForm(form({ instrumentId: '1', date: '2026-03-02', side: 'buy', units: '1' }))
		).toBe('Enter the price or the value.');
	});

	it('works out a distribution amount, or the per-unit rate', () => {
		expect(
			readDistributionForm(
				form({ instrumentId: '1', date: '2026-01-16', perUnit: '0.25', units: '100' })
			)
		).toMatchObject({ amountCents: 2500, perUnitE6: 250_000, reinvested: false });
		expect(
			readDistributionForm(
				form({
					instrumentId: '1',
					date: '2026-01-16',
					amount: '25',
					units: '100',
					reinvested: 'on'
				})
			)
		).toMatchObject({ amountCents: 2500, perUnitE6: 250_000, reinvested: true });
	});
});

describe('editing keeps a history', () => {
	const fund = db
		.insert(schema.instruments)
		.values({ ticker: 'VAS', createdAt: now, updatedAt: now })
		.returning()
		.get();
	const base = {
		instrumentId: fund.id,
		date: '2026-03-02',
		side: 'buy' as const,
		unitsE6: 1e6,
		priceE4: 1e6,
		valueCents: 10_000,
		feeCents: 0,
		orderId: null,
		note: null
	};

	it('records each changed field with the reason', () => {
		const id = addTrade(base, 'manual') as number;
		expect(updateTrade(id, { ...base, date: '2026-03-03', note: 'typo' }, 'fixed date')).toBeNull();
		const e = editsOf('trade', id);
		expect(e.map((x) => [x.field, x.oldValue, x.newValue, x.reason]).sort()).toEqual([
			['date', '2026-03-02', '2026-03-03', 'fixed date'],
			['note', null, 'typo', 'fixed date']
		]);
		deleteTrade(id, null);
		expect(findTrade(id)).toBeUndefined();
		expect(editsOf('trade', id)[0].field).toBe('deleted');
	});

	it('refuses a second trade with the same order ID, or a doubled distribution', () => {
		expect(addTrade({ ...base, orderId: 'A1' }, 'manual')).toBeTypeOf('number');
		expect(addTrade({ ...base, orderId: 'A1' }, 'manual')).toMatch(/already recorded/);
		const d = {
			instrumentId: fund.id,
			date: '2026-01-16',
			unitsE6: null,
			perUnitE6: null,
			amountCents: 100,
			frankingCents: null,
			reinvested: false,
			note: null
		};
		expect(addDistribution(d, 'manual')).toBeTypeOf('number');
		expect(addDistribution(d, 'manual')).toMatch(/already a distribution/);
	});
});
