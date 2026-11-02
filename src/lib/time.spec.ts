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
