import { describe, expect, it } from 'vitest';
import { applyTheme, themeMetas, themeOf } from './theme';

describe('theme head', () => {
	it('falls back to dark for anything unknown', () => {
		expect(themeOf('light')).toBe('light');
		expect(themeOf('system')).toBe('system');
		expect(themeOf('purple')).toBe('dark');
		expect(themeOf(null)).toBe('dark');
	});

	it('gives a single theme-color for a fixed theme', () => {
		expect(themeMetas('dark')).toContain('content="#111113"');
		expect(themeMetas('dark')).toContain('black-translucent');
		expect(themeMetas('light')).not.toContain('black-translucent');
		expect(themeMetas('light').match(/theme-color/g)).toHaveLength(1);
	});

	it('gives one theme-color per scheme when following the phone', () => {
		const m = themeMetas('system');
		expect(m.match(/name="theme-color"/g)).toHaveLength(2);
		expect(m).toContain('(prefers-color-scheme: dark)');
		expect(m).toContain('content="light dark"');
	});

	it('fills the placeholders in app.html', () => {
		const out = applyTheme('<html data-theme="%tally.theme%"><head>%tally.themeMetas%', 'light');
		expect(out).toContain('data-theme="light"');
		expect(out).not.toContain('%tally');
	});
});
