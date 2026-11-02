import { describe, expect, it } from 'vitest';
import { allowAttempt } from './limiter';

describe('allowAttempt', () => {
	it('allows 20 attempts per 15 minutes per address', () => {
		const t0 = 1_000_000;
		for (let i = 0; i < 20; i++) expect(allowAttempt('a', t0 + i)).toBe(true);
		expect(allowAttempt('a', t0 + 100)).toBe(false);
		expect(allowAttempt('b', t0 + 100)).toBe(true);
		expect(allowAttempt('a', t0 + 15 * 60 * 1000 + 50)).toBe(true);
	});
});
