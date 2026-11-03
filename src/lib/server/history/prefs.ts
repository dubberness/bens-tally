import type { Theme } from '$lib/theme';
import { getSetting, setSetting } from '../settings';

/*
 * Typed settings shown on Manage › Settings. Other areas import these accessors
 * instead of reading keys themselves. Every default here is a generic starting
 * point, not anyone's real figure.
 */

export type { Theme };

export interface PrefDef<T> {
	key: string;
	label: string;
	help: string;
	fallback: T;
}

export const PREFS = {
	payday: {
		key: 'prefs.payday',
		label: 'Payday',
		help: 'The weekday your pay lands. The budget uses it to line up pay with transfers to savers.',
		fallback: null as number | null
	},
	closeTime: {
		key: 'prefs.close_time',
		label: 'Month-end reading time',
		help: 'When the last-day-of-the-month reading of automatic accounts is taken (24-hour, local time).',
		fallback: '23:59'
	},
	birthDate: {
		key: 'prefs.birth_date',
		label: 'Birth date',
		help: 'Used by Plan to turn years into ages, such as when super can be reached.',
		fallback: null as string | null
	},
	sureBp: {
		key: 'prefs.sure_threshold_bp',
		label: 'Ask “Sure?” when a number is this far off',
		help: 'On Close the month, a typed value more than this far from the expected one asks you to confirm.',
		fallback: 500
	},
	theme: {
		key: 'prefs.theme',
		label: 'Theme',
		help: 'Dark, light, or whatever the phone or computer is set to.',
		fallback: 'dark' as Theme
	}
} as const;

function read<T>(def: PrefDef<T>): T {
	return getSetting<T>(def.key) ?? def.fallback;
}

/** Weekday pay arrives, 0 = Sunday … 6 = Saturday, or null if not set. */
export const payday = () => read<number | null>(PREFS.payday);
/** 'HH:MM', local time. */
export const closeTime = () => read<string>(PREFS.closeTime);
/** 'YYYY-MM-DD' or null. */
export const birthDate = () => read<string | null>(PREFS.birthDate);
/** Basis points, e.g. 500 = 5%. */
export const sureThresholdBp = () => read<number>(PREFS.sureBp);
export const theme = () => read<Theme>(PREFS.theme);

export interface PrefValues {
	payday: number | null;
	closeTime: string;
	birthDate: string | null;
	sureBp: number;
	theme: Theme;
}

export function allPrefs(): PrefValues {
	return {
		payday: payday(),
		closeTime: closeTime(),
		birthDate: birthDate(),
		sureBp: sureThresholdBp(),
		theme: theme()
	};
}

export function savePrefs(values: Partial<PrefValues>) {
	for (const [name, value] of Object.entries(values)) {
		const def = PREFS[name as keyof typeof PREFS];
		if (def && value !== undefined) setSetting(def.key, value);
	}
}
