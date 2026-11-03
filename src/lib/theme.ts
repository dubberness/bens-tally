export type Theme = 'dark' | 'light' | 'system';

/*
 * What the page head says about the colour scheme. The server fills these into
 * app.html for every page so the right colours are there on first paint.
 * The two ground colours must match --ground in app.css.
 */

export const GROUND = { dark: '#111113', light: '#f3efe8' } as const;

export function themeOf(value: unknown): Theme {
	return value === 'light' || value === 'system' ? value : 'dark';
}

/** The meta tags that depend on the theme: theme-color, color-scheme and the iOS status bar. */
export function themeMetas(theme: Theme): string {
	const colour =
		theme === 'system'
			? `<meta name="theme-color" content="${GROUND.light}" media="(prefers-color-scheme: light)" />\n` +
				`\t\t<meta name="theme-color" content="${GROUND.dark}" media="(prefers-color-scheme: dark)" />`
			: `<meta name="theme-color" content="${GROUND[theme]}" />`;
	const scheme = theme === 'system' ? 'light dark' : theme;
	// black-translucent paints white clock text, so only the dark theme can use it.
	const bar = theme === 'dark' ? 'black-translucent' : 'default';
	return (
		`${colour}\n\t\t<meta name="color-scheme" content="${scheme}" />\n` +
		`\t\t<meta name="apple-mobile-web-app-status-bar-style" content="${bar}" />`
	);
}

/** Fills the theme placeholders in app.html. */
export function applyTheme(html: string, theme: Theme): string {
	return html.replace('%tally.theme%', theme).replace('%tally.themeMetas%', themeMetas(theme));
}

/** In the browser: switch to a theme straight away, without waiting for a page load. */
export function showTheme(theme: Theme) {
	const root = document.documentElement;
	root.dataset.theme = theme;
	const metas = document.createElement('div');
	metas.innerHTML = themeMetas(theme);
	for (const old of root.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]'))
		old.remove();
	document.head.prepend(...metas.children);
}
