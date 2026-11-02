import { describe, expect, it } from 'vitest';
import { localDate, localMinutes, localMonth, localParts } from './time';

describe('Hobart time', () => {
	it('uses daylight saving in November (UTC+11)', () => {
		// 2026-11-01 15:30 UTC = 2026-11-02 02:30 AEDT
		const at = new Date('2026-11-01T15:30:00Z');
		expect(localDate(at)).toBe('2026-11-02');
		expect(localMinutes(at)).toBe(150);
		expect(localParts(at).weekday).toBe(1);
	});
	it('uses standard time in July (UTC+10)', () => {
		const at = new Date('2026-07-31T14:30:00Z');
		expect(localDate(at)).toBe('2026-08-01');
		expect(localMonth(at)).toBe('2026-08');
	});
});

describe('month helpers', () => {
	it('finds the last day of a month, leap years included', async () => {
		const { lastDayOfMonth, addMonths, addDays } = await import('./time');
		expect(lastDayOfMonth('2026-11')).toBe('2026-11-30');
		expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
		expect(addMonths('2026-11', 2)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
	});
	it('knows the latest ended month in Hobart time', async () => {
		const { lastEndedMonth } = await import('./time');
		expect(lastEndedMonth(new Date('2026-11-30T23:58:00+11:00'))).toBe('2026-10');
		expect(lastEndedMonth(new Date('2026-11-30T23:59:00+11:00'))).toBe('2026-11');
		expect(lastEndedMonth(new Date('2026-12-01T00:00:00+11:00'))).toBe('2026-11');
	});
});
