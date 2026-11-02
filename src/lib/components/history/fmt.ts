import { formatMoney } from '$lib/money';

/** Signed money for changes: +$1,234 / −$1,234. */
export const signed = (c: number) => formatMoney(c, { sign: true });

/** CSS class for a change: gain, loss or nothing for zero. */
export const tone = (c: number) =>
	Math.round(c / 100) > 0 ? 'gain' : Math.round(c / 100) < 0 ? 'loss' : '';

/** A liability shows as −$x on lists of what you own and owe. */
export const owed = (c: number, side: string) => formatMoney(side === 'liability' ? -c : c);

/** ▲ $1,234 or ▼ $1,234. */
export const arrow = (c: number) => `${c >= 0 ? '▲' : '▼'} ${formatMoney(Math.abs(c))}`;
