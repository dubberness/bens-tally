import { describe, expect, it } from 'vitest';
import { colName, parseRef, serialToDate } from './xlsx';

describe('xlsx helpers', () => {
	it('parses references', () => {
		expect(parseRef('A1')).toEqual([1, 1]);
		expect(parseRef('AB12')).toEqual([12, 28]);
		expect(colName(28)).toBe('AB');
		expect(colName(1)).toBe('A');
	});
	it('converts serial dates', () => {
		expect(serialToDate(45658)).toBe('2025-01-01');
		expect(serialToDate(45658.75)).toBe('2025-01-01');
	});
});
