import { addDays } from '$lib/time';

/*
 * Chart ranges for the Invest value chart. Pure and free of server code so the page and
 * the tests share it.
 */

/** One day (or, far back, one week) of the portfolio. */
export interface ValuePoint {
	date: string;
	/** Everything held at the end of the day, at that day's prices. */
	valueCents: number;
	/** Money put in (buys and fees) less money taken out (sales) over the day or week. */
	flowCents: number;
	/** True when a buy or sell happened in it. */
	traded: boolean;
}

export type Range = '1w' | '1m' | '1y' | 'all';
export const RANGES: { id: Range; label: string }[] = [
	{ id: '1w', label: '1W' },
	{ id: '1m', label: '1M' },
	{ id: '1y', label: '1Y' },
	{ id: 'all', label: 'All' }
];

/** First date a range covers (null = from the start). */
export function rangeStart(range: Range, today: string): string | null {
	if (range === '1w') return addDays(today, -7);
	if (range === '1m') return addDays(today, -30);
	if (range === '1y') return addDays(today, -365);
	return null;
}

export interface RangeView {
	/** What the chart draws: the day before the range as its starting level, then the range. */
	shown: ValuePoint[];
	startCents: number;
	endCents: number;
	/** Value now less value at the start. */
	changeCents: number;
	/** Net money added in the range. */
	moneyInCents: number;
	/** Change that isn't new money: what the market did. */
	marketCents: number;
}

/**
 * The points for a range and what happened over it. The level just before the range is
 * the starting value (nothing, for the whole history), and only money moved after it
 * counts as money in, so a buy never looks like a gain.
 */
export function rangeView(points: ValuePoint[], start: string | null): RangeView {
	const first = start == null ? 0 : points.findIndex((p) => p.date >= start);
	const from = first === -1 ? points.length : first;
	const baseline = from > 0 ? points[from - 1] : null;
	const inRange = points.slice(from);
	const startCents = baseline?.valueCents ?? 0;
	const endCents = inRange.length ? inRange[inRange.length - 1].valueCents : startCents;
	const moneyInCents = inRange.reduce((s, p) => s + p.flowCents, 0);
	const changeCents = endCents - startCents;
	return {
		shown: baseline ? [baseline, ...inRange] : inRange,
		startCents,
		endCents,
		changeCents,
		moneyInCents,
		marketCents: changeCents - moneyInCents
	};
}
