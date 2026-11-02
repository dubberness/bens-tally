import { describe, expect, it } from 'vitest';
import { matchFifo, type LotTrade } from './lots';

const buy = (date: string, units: number, value: number, fee = 0, id?: number): LotTrade => ({
	id,
	date,
	side: 'buy',
	unitsE6: units * 1e6,
	valueCents: value * 100,
	feeCents: fee * 100
});
const sell = (date: string, units: number, value: number, fee = 0, id?: number): LotTrade => ({
	...buy(date, units, value, fee, id),
	side: 'sell'
});

describe('matchFifo', () => {
	it('keeps every buy as a parcel with the fee in its cost', () => {
		const r = matchFifo([buy('2024-01-02', 10, 100, 5), buy('2024-02-02', 5, 60)]);
		expect(r.parcels.map((p) => p.costCents)).toEqual([10_500, 6_000]);
		expect(r.disposals).toEqual([]);
	});

	it('sells the oldest parcels first and splits a parcel', () => {
		const r = matchFifo([
			buy('2024-01-02', 10, 100),
			buy('2024-02-02', 10, 200),
			sell('2024-03-02', 15, 450, 10)
		]);
		expect(r.disposals).toHaveLength(2);
		const [a, b] = r.disposals;
		expect(a).toMatchObject({ boughtOn: '2024-01-02', unitsE6: 10e6, costCents: 10_000 });
		expect(b).toMatchObject({ boughtOn: '2024-02-02', unitsE6: 5e6, costCents: 10_000 });
		// Proceeds after the fee, shared by units: 440 → 293.33 + 146.67.
		expect(a.proceedsCents + b.proceedsCents).toBe(44_000);
		expect(a.gainCents + b.gainCents).toBe(24_000);
		expect(r.parcels).toEqual([
			{ tradeId: undefined, date: '2024-02-02', unitsE6: 5e6, costCents: 10_000 }
		]);
	});

	it('puts same-day buys before sells', () => {
		const r = matchFifo([sell('2024-01-02', 1, 12, 0, 2), buy('2024-01-02', 1, 10, 0, 1)]);
		expect(r.oversoldE6).toBe(0);
		expect(r.disposals[0].gainCents).toBe(200);
	});

	it('counts units sold beyond what was bought', () => {
		const r = matchFifo([buy('2024-01-02', 1, 10), sell('2024-01-03', 3, 30)]);
		expect(r.oversoldE6).toBe(2e6);
	});

	it('only looks at trades up to a date', () => {
		const r = matchFifo([buy('2024-01-02', 1, 10), sell('2024-05-01', 1, 30)], '2024-04-30');
		expect(r.parcels).toHaveLength(1);
		expect(r.disposals).toHaveLength(0);
	});
});
