import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money';

describe('formatMoney', () => {
	it('shows whole dollars by default', () => {
		expect(formatMoney(12345600)).toBe('$123,456');
		expect(formatMoney(-9876500)).toBe('−$98,765');
	});
	it('shows signs for changes', () => {
		expect(formatMoney(250000, { sign: true })).toBe('+$2,500');
		expect(formatMoney(-31200, { sign: true })).toBe('−$312');
		expect(formatMoney(0, { sign: true })).toBe('$0');
	});
	it('shows cents when asked', () => {
		expect(formatMoney(-12345, { cents: true })).toBe('−$123.45');
		expect(formatMoney(100050, { cents: true })).toBe('$1,000.50');
	});
	it('does not print −$0 for tiny negatives', () => {
		expect(formatMoney(-40)).toBe('$0');
	});
});

describe('parseMoney', () => {
	it('accepts the usual ways of typing an amount', () => {
		expect(parseMoney('$1,234.5')).toBe(123450);
		expect(parseMoney('-20')).toBe(-2000);
		expect(parseMoney('−7.05')).toBe(-705);
		expect(parseMoney(' 120500 ')).toBe(12050000);
	});
	it('rejects nonsense', () => {
		expect(parseMoney('abc')).toBeNull();
		expect(parseMoney('1.234')).toBeNull();
		expect(parseMoney('')).toBeNull();
	});
});
