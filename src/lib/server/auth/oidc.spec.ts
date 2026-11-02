import { describe, expect, it, vi } from 'vitest';

vi.mock('../settings', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock('../env', () => ({
	oidc: { issuer: '', clientId: '', clientSecret: '', allowedSubjects: [] }
}));

const { safeReturn } = await import('./oidc');

describe('safeReturn', () => {
	it('keeps same-site paths', () => {
		expect(safeReturn('/months?m=2026-10')).toBe('/months?m=2026-10');
	});
	it('refuses anything that could leave the site or loop', () => {
		for (const bad of [
			'//evil.example',
			'/\\evil.example',
			'https://evil.example',
			'/auth/login',
			'',
			null
		]) {
			expect(safeReturn(bad)).toBe('/');
		}
	});
});
