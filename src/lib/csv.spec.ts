import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csv', () => {
	it('leaves plain values alone', () => {
		expect(csvCell('Groceries')).toBe('Groceries');
		expect(csvCell(12.5)).toBe('12.5');
		expect(csvCell(false)).toBe('false');
	});

	it('writes null and undefined as empty', () => {
		expect(csvCell(null)).toBe('');
		expect(csvCell(undefined)).toBe('');
	});

	it('quotes commas, line breaks and quotes, doubling the quotes', () => {
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
		expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
	});

	it('keeps spaces and unicode as they are', () => {
		expect(csvCell('  padded  ')).toBe('  padded  ');
		expect(csvCell('café ☕')).toBe('café ☕');
	});

	it('joins rows with a trailing newline and keeps blank rows', () => {
		expect(toCsv([['a', 'b,c'], [], ['1', null, 3]])).toBe('a,"b,c"\n\n1,,3\n');
	});
});
