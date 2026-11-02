import { describe, expect, it } from 'vitest';
import { readChart, readSheetCsv, yahooSymbol } from './prices';
import { pricesDue } from './jobs';

describe('prices', () => {
	it('names ASX funds the Yahoo way', () => {
		expect(yahooSymbol({ ticker: 'ABC', exchange: 'ASX' })).toBe('ABC.AX');
		expect(yahooSymbol({ ticker: 'XYZ', exchange: 'NYSE' })).toBe('XYZ');
	});

	it('reads daily closes and the live price from a chart response', () => {
		// 2026-06-01 and 2026-06-02 at 10:00 Hobart (UTC+10).
		const json = {
			chart: {
				result: [
					{
						meta: { regularMarketPrice: 12.34, regularMarketTime: 1780444800 + 3600 },
						timestamp: [1780272000, 1780358400],
						indicators: { quote: [{ close: [10.5, null] }] }
					}
				]
			}
		};
		expect(readChart(json, '2026-06-03')).toEqual([
			{ date: '2026-06-01', closeE4: 105_000 },
			{ date: '2026-06-03', closeE4: 123_400 }
		]);
		expect(readChart({}, '2026-06-03')).toEqual([]);
	});

	it('finds a price in a published sheet CSV', () => {
		expect(readSheetCsv('ABC,12.5\nXYZ,3', 'XYZ')).toBe(3);
		expect(readSheetCsv('ASX:ABC,"$1,234.50"', 'ABC')).toBe(1234.5);
		expect(readSheetCsv('41.18', 'ABC')).toBe(41.18);
		expect(readSheetCsv('1,2', 'ABC')).toBeNull();
	});
});

describe('pricesDue', () => {
	// Hobart is UTC+11 in summer: 2026-11-04 is a Wednesday.
	const at = (hhmm: string, day = '2026-11-04') => new Date(`${day}T${hhmm}:00+11:00`);
	it('runs the first time whenever', () => {
		expect(pricesDue(at('03:00'), null)).toBe(true);
	});
	it('runs every 15 minutes while the market is open', () => {
		expect(pricesDue(at('11:00'), at('10:50'))).toBe(false);
		expect(pricesDue(at('11:05'), at('10:50'))).toBe(true);
	});
	it('runs once after the close', () => {
		expect(pricesDue(at('16:30'), at('16:15'))).toBe(true);
		expect(pricesDue(at('16:45'), at('16:30'))).toBe(false);
		expect(pricesDue(at('08:00'), at('16:30', '2026-11-03'))).toBe(false);
	});
	it('rests at weekends', () => {
		expect(pricesDue(at('11:00', '2026-11-07'), at('16:30', '2026-11-06'))).toBe(false);
	});
});
