import { describe, expect, it } from 'vitest';
import { rangeView } from '$lib/invest/range';
import { dayChange, dayLabel, downsample, sumChanges, unitsLookup, valueSeries } from './daily';
import type { LotTrade } from './lots';

const trade = (date: string, side: 'buy' | 'sell', units: number, price: number): LotTrade => ({
	date,
	side,
	unitsE6: Math.round(units * 1e6),
	valueCents: Math.round(units * price * 100),
	feeCents: 0
});
const close = (date: string, price: number) => ({ date, closeE4: Math.round(price * 1e4) });

// 2025-03-14 is a Friday, 03-15 a Saturday, 03-17 a Monday.
describe('units held by date', () => {
	it('counts a day’s trades at its end and ignores later ones', () => {
		const at = unitsLookup([
			trade('2025-03-10', 'buy', 10, 20),
			trade('2025-03-12', 'sell', 4, 25),
			trade('2025-03-12', 'buy', 1, 25)
		]);
		expect(at('2025-03-09')).toBe(0);
		expect(at('2025-03-10')).toBe(10e6);
		expect(at('2025-03-12')).toBe(7e6);
		expect(at('2025-04-01')).toBe(7e6);
	});

	it('treats a rounding residue as sold out', () => {
		const at = unitsLookup([
			trade('2025-03-10', 'buy', 10, 20),
			trade('2025-03-12', 'sell', 9.9999, 25)
		]);
		expect(at('2025-03-11')).toBe(10e6);
		expect(at('2025-03-12')).toBe(0);
	});
});

describe('one fund’s change since the previous close', () => {
	const bought = trade('2025-03-10', 'buy', 10, 20);

	it('is units held × (latest − previous close)', () => {
		const c = dayChange([bought], [close('2025-03-13', 20), close('2025-03-14', 21)]);
		expect(c).toEqual({ date: '2025-03-14', cents: 1000, baseCents: 20_000 });
	});

	it('leaves out units bought on the day', () => {
		// 5 more units bought on the 14th at 21: only the 10 held at the 13th's close count.
		const c = dayChange(
			[bought, trade('2025-03-14', 'buy', 5, 21)],
			[close('2025-03-13', 20), close('2025-03-14', 22)]
		);
		expect(c).toEqual({ date: '2025-03-14', cents: 2000, baseCents: 20_000 });
	});

	it('has no move for a fund bought on the day', () => {
		const c = dayChange(
			[trade('2025-03-14', 'buy', 5, 21)],
			[close('2025-03-13', 20), close('2025-03-14', 22)]
		);
		expect(c).toBeNull();
	});

	it('still counts units sold on the day, up to the latest price', () => {
		const c = dayChange(
			[bought, trade('2025-03-14', 'sell', 4, 21)],
			[close('2025-03-13', 20), close('2025-03-14', 19)]
		);
		expect(c?.cents).toBe(-1000);
	});

	it('shows the last trading day at the weekend', () => {
		const c = dayChange([bought], [close('2025-03-13', 20), close('2025-03-14', 19.5)]);
		expect(c).toMatchObject({ date: '2025-03-14', cents: -500 });
		expect(dayLabel(c!.date, '2025-03-15')).toBe('Friday');
		expect(dayLabel(c!.date, '2025-03-17')).toBe('Friday');
		expect(dayLabel('2025-03-17', '2025-03-17')).toBe('today');
		expect(dayLabel('2025-03-03', '2025-03-17')).toBe('3 Mar');
	});

	it('compares a typed-in price with the last stored close', () => {
		const c = dayChange([bought], [close('2025-03-13', 20)], close('2025-03-14', 21));
		expect(c?.cents).toBe(1000);
	});

	it('has nothing to compare with when the fund has only one price', () => {
		expect(dayChange([bought], [close('2025-03-14', 21)])).toBeNull();
		expect(dayChange([bought], [])).toBeNull();
	});

	it('ignores a fund that is only rounding residue', () => {
		const c = dayChange(
			[trade('2025-03-01', 'buy', 10, 20), trade('2025-03-05', 'sell', 9.9999, 20)],
			[close('2025-03-13', 20), close('2025-03-14', 21)]
		);
		expect(c).toBeNull();
	});
});

describe('the whole portfolio’s change', () => {
	it('adds funds up and keeps the percentage on what was held', () => {
		const sum = sumChanges([
			{ date: '2025-03-14', cents: 1000, baseCents: 20_000 },
			{ date: '2025-03-14', cents: -300, baseCents: 10_000 }
		]);
		expect(sum).toEqual({ date: '2025-03-14', cents: 700, baseCents: 30_000 });
	});

	it('leaves out a fund whose latest price is from an earlier day', () => {
		const sum = sumChanges([
			{ date: '2025-03-14', cents: 1000, baseCents: 20_000 },
			{ date: '2025-03-12', cents: 9999, baseCents: 10_000 }
		]);
		expect(sum?.cents).toBe(1000);
		expect(sumChanges([])).toBeNull();
	});
});

describe('daily value', () => {
	const trades = [trade('2025-03-10', 'buy', 10, 20), trade('2025-03-12', 'buy', 5, 22)];
	const closes = [
		close('2025-03-10', 20),
		close('2025-03-11', 21),
		close('2025-03-12', 22),
		close('2025-03-13', 23)
	];

	it('values each day at the units held then, and records the money moved', () => {
		const s = valueSeries([{ trades, closes }], '2025-03-13');
		expect(s.map((p) => [p.date, p.valueCents, p.flowCents, p.traded])).toEqual([
			['2025-03-10', 20_000, 20_000, true],
			['2025-03-11', 21_000, 0, false],
			['2025-03-12', 33_000, 11_000, true],
			['2025-03-13', 34_500, 0, false]
		]);
	});

	it('carries a close over days with none and adds a point for today', () => {
		const s = valueSeries([{ trades, closes }], '2025-03-15');
		expect(s.at(-1)).toMatchObject({ date: '2025-03-15', valueCents: 34_500 });
	});

	it('uses the trade price before any close exists', () => {
		const s = valueSeries(
			[{ trades: [trade('2025-03-10', 'buy', 10, 20)], closes: [] }],
			'2025-03-11'
		);
		expect(s.map((p) => p.valueCents)).toEqual([20_000, 20_000]);
	});

	it('adds funds together and keeps a sold-out fund’s history', () => {
		const a = { trades, closes };
		const b = {
			trades: [trade('2025-03-10', 'buy', 2, 100), trade('2025-03-11', 'sell', 2, 110)],
			closes: [close('2025-03-10', 100), close('2025-03-11', 110)]
		};
		const s = valueSeries([a, b], '2025-03-13');
		expect(s[0].valueCents).toBe(20_000 + 20_000);
		expect(s[1].valueCents).toBe(21_000);
		expect(s[1].flowCents).toBe(-22_000);
	});

	it('starts with nothing held', () => {
		expect(valueSeries([], '2025-03-13')).toEqual([]);
	});
});

describe('long histories', () => {
	it('keeps recent days and folds older ones into weeks, adding up the money moved', () => {
		const days = [
			'2025-03-03',
			'2025-03-04',
			'2025-03-05',
			'2025-03-10',
			'2025-03-17',
			'2025-03-18'
		];
		const pts = days.map((date, i) => ({
			date,
			valueCents: 1000 * (i + 1),
			flowCents: i === 0 || i === 2 ? 500 : 0,
			traded: i === 0 || i === 2
		}));
		const out = downsample(pts, '2025-03-17');
		expect(out.map((p) => p.date)).toEqual([
			'2025-03-05',
			'2025-03-10',
			'2025-03-17',
			'2025-03-18'
		]);
		expect(out[0]).toEqual({ date: '2025-03-05', valueCents: 3000, flowCents: 1000, traded: true });
		expect(out[1].traded).toBe(false);
	});
});

describe('a range of the chart', () => {
	const pts = [
		{ date: '2025-03-10', valueCents: 10_000, flowCents: 10_000, traded: true },
		{ date: '2025-03-11', valueCents: 10_500, flowCents: 0, traded: false },
		{ date: '2025-03-12', valueCents: 13_000, flowCents: 2000, traded: true },
		{ date: '2025-03-13', valueCents: 13_200, flowCents: 0, traded: false }
	];

	it('splits the change into money in and the market', () => {
		const v = rangeView(pts, '2025-03-12');
		expect(v.startCents).toBe(10_500);
		expect(v.changeCents).toBe(2700);
		expect(v.moneyInCents).toBe(2000);
		expect(v.marketCents).toBe(700);
		expect(v.shown.map((p) => p.date)).toEqual(['2025-03-11', '2025-03-12', '2025-03-13']);
	});

	it('counts everything from nothing when the range covers the whole history', () => {
		const v = rangeView(pts, null);
		expect(v.startCents).toBe(0);
		expect(v.moneyInCents).toBe(12_000);
		expect(v.marketCents).toBe(1200);
		expect(rangeView(pts, '2024-01-01').marketCents).toBe(1200);
	});

	it('copes with a range after the last point', () => {
		const v = rangeView(pts, '2025-04-01');
		expect(v).toMatchObject({ changeCents: 0, moneyInCents: 0, marketCents: 0 });
		expect(rangeView([], null).shown).toEqual([]);
	});
});
