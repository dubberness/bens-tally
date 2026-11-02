import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {}, schema: {} }));
vi.mock('./backup', () => ({ runBackup: vi.fn() }));
vi.mock('../auth/session', () => ({ pruneSessions: vi.fn() }));

const { dailyAfter } = await import('./scheduler');

describe('dailyAfter(2, 30)', () => {
	const due = dailyAfter(2, 30);
	// Hobart is UTC+11 in November.
	const at = (local: string) => new Date(`${local}+11:00`);

	it('waits until 2:30 am local time', () => {
		expect(due(at('2026-11-03T02:29'), at('2026-11-02T02:30'))).toBe(false);
		expect(due(at('2026-11-03T02:30'), at('2026-11-02T02:30'))).toBe(true);
	});
	it('runs once per day', () => {
		expect(due(at('2026-11-03T09:00'), at('2026-11-03T02:30'))).toBe(false);
	});
	it('catches up later in the day if the app was down', () => {
		expect(due(at('2026-11-03T14:00'), at('2026-11-01T02:30'))).toBe(true);
	});
	it('runs on the first start', () => {
		expect(due(at('2026-11-03T03:00'), null)).toBe(true);
	});
});
