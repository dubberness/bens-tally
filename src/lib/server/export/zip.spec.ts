import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { dosDateTime, zipStore } from './zip';

describe('zipStore', () => {
	it('makes a zip that a standard reader opens, byte for byte', () => {
		const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
		const zip = zipStore([
			{ name: 'one.csv', data: 'a,b\n1,2\n' },
			{ name: 'bytes.bin', data: bytes },
			{ name: 'empty.csv', data: '' }
		]);
		const out = unzipSync(new Uint8Array(zip));
		expect(Object.keys(out).sort()).toEqual(['bytes.bin', 'empty.csv', 'one.csv']);
		expect(strFromU8(out['one.csv'])).toBe('a,b\n1,2\n');
		expect([...out['bytes.bin']]).toEqual([...bytes]);
		expect(out['empty.csv']).toHaveLength(0);
	});

	it('keeps non-ASCII names and text', () => {
		const out = unzipSync(new Uint8Array(zipStore([{ name: 'café.csv', data: 'naïve ☕\n' }])));
		expect(strFromU8(out['café.csv'])).toBe('naïve ☕\n');
	});

	it('does not compress, so sizes match the data', () => {
		const text = 'x'.repeat(5000);
		const zip = zipStore([{ name: 'a.txt', data: text }]);
		// local header (30) + name (5) + data, then the directory entry (46 + 5) and the end record (22)
		expect(zip.length).toBe(30 + 5 + 5000 + 46 + 5 + 22);
	});

	it('writes a valid empty zip', () => {
		const zip = zipStore([]);
		expect(zip.length).toBe(22);
		expect(Object.keys(unzipSync(new Uint8Array(zip)))).toEqual([]);
	});

	it('packs the date and time the zip way', () => {
		const { date, time } = dosDateTime(new Date(2026, 10, 3, 14, 30, 42)); // 3 Nov 2026
		expect(date).toBe(((2026 - 1980) << 9) | (11 << 5) | 3);
		expect(time).toBe((14 << 11) | (30 << 5) | 21);
	});
});
