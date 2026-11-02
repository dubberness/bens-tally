import { describe, expect, it } from 'vitest';
import { toPrune } from './retention';

describe('toPrune', () => {
	it('keeps the newest files and ignores anything else in the folder', () => {
		const names = [
			'tally-2026-11-03.db',
			'tally-2026-11-01.db',
			'notes.txt',
			'tally-2026-11-02.db'
		];
		expect(toPrune(names, 2)).toEqual(['tally-2026-11-01.db']);
	});
	it('deletes nothing when under the limit', () => {
		expect(toPrune(['tally-2026-10.db'], 12)).toEqual([]);
	});
	it('handles monthly names', () => {
		const names = [
			'2025-11',
			'2025-12',
			...Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
		].map((m) => `tally-${m}.db`);
		expect(toPrune(names, 12)).toEqual(['tally-2025-11.db', 'tally-2025-12.db']);
	});
});
