import { asc, eq } from 'drizzle-orm';
import { addDays, daysBetween, localDate, shortDate, weekdayOf } from '$lib/time';
import type { ValuePoint } from '$lib/invest/range';
import { db, schema } from '../db';
import { priceOn, tradesOf, valueOf } from './holdings';
import { openUnits, tradeOrder, type LotTrade } from './lots';
import type { Close } from './prices';

/*
 * Daily performance: what the portfolio did since the previous close, and its value day
 * by day. The calculations are pure (trades and closes in, numbers out) so they can be
 * tested without a database; `performance()` at the bottom feeds them from the tables.
 */

/** Units held at the end of a date, from one fund's trades. */
export function unitsLookup(trades: LotTrade[]): (date: string) => number {
	const timeline: { date: string; unitsE6: number }[] = [];
	let units = 0;
	for (const t of [...trades].sort(tradeOrder)) {
		// A sale of units never bought leaves nothing held, as in the parcels.
		units = t.side === 'buy' ? units + t.unitsE6 : Math.max(0, units - t.unitsE6);
		const last = timeline[timeline.length - 1];
		if (last?.date === t.date) last.unitsE6 = units;
		else timeline.push({ date: t.date, unitsE6: units });
	}
	return (date) => {
		let lo = 0;
		let hi = timeline.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (timeline[mid].date <= date) lo = mid + 1;
			else hi = mid;
		}
		return lo ? openUnits(timeline[lo - 1].unitsE6) : 0;
	};
}

/** The last close on or before a date. */
function closeOnOrBefore(closes: Close[], date: string): Close | null {
	let lo = 0;
	let hi = closes.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (closes[mid].date <= date) lo = mid + 1;
		else hi = mid;
	}
	return lo ? closes[lo - 1] : null;
}

export interface DayChange {
	/** The day the latest price is from. */
	date: string;
	/** Units held at the previous close × (latest price − that close). */
	cents: number;
	/** What those units were worth at the previous close, the base for the percentage. */
	baseCents: number;
}

/**
 * How much one fund moved between its previous close and its latest price. Only units
 * held at the end of the previous price date count, so units bought today add nothing
 * (their cost isn't a gain) and the move is never shown against money put in. Units sold
 * today still count the move up to the latest price, since they were held until then.
 * Null when there's no earlier close to compare with, or nothing was held at it.
 */
export function dayChange(
	trades: LotTrade[],
	closes: Close[],
	latest: Close | null = closes[closes.length - 1] ?? null
): DayChange | null {
	if (!latest) return null;
	const prev = [...closes].reverse().find((c) => c.date < latest.date);
	if (!prev) return null;
	const unitsE6 = unitsLookup(trades)(prev.date);
	if (!unitsE6) return null;
	return {
		date: latest.date,
		cents: Math.round((unitsE6 * (latest.closeE4 - prev.closeE4)) / 1e8),
		baseCents: valueOf(unitsE6, prev.closeE4)
	};
}

/**
 * Add funds' changes together. Funds whose latest price is older than the newest one (a
 * fund that didn't trade or wasn't updated) are left out so two different days never mix.
 */
export function sumChanges(changes: DayChange[]): DayChange | null {
	if (!changes.length) return null;
	const date = changes.reduce((d, c) => (c.date > d ? c.date : d), '');
	const same = changes.filter((c) => c.date === date);
	return {
		date,
		cents: same.reduce((s, c) => s + c.cents, 0),
		baseCents: same.reduce((s, c) => s + c.baseCents, 0)
	};
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "today", or the weekday the figures are from ("Friday"), or a date when it's older. */
export function dayLabel(date: string, today: string): string {
	if (date >= today) return 'today';
	return daysBetween(date, today) <= 6 ? DAY_NAMES[weekdayOf(date)] : shortDate(date);
}

export interface FundRecord {
	trades: LotTrade[];
	closes: Close[];
}

/** Money a trade put in (buy plus fee) or took out (sale less fee, negative). */
const flowOf = (t: LotTrade) =>
	t.side === 'buy' ? t.valueCents + t.feeCents : -(t.valueCents - t.feeCents);

/**
 * Portfolio value on each day there is a price or a trade, from the first trade to
 * `today`: units held that day × that day's close (the last close before it on days with
 * none, the trade's own price before any close exists). Sold-out funds keep their history.
 */
export function valueSeries(funds: FundRecord[], today: string): ValuePoint[] {
	const first = funds
		.flatMap((f) => f.trades.map((t) => t.date))
		.reduce<string | null>((d, x) => (d == null || x < d ? x : d), null);
	if (first == null) return [];
	const dates = new Set<string>([today]);
	for (const f of funds) {
		for (const t of f.trades) dates.add(t.date);
		for (const c of f.closes) dates.add(c.date);
	}
	const prepared = funds.map((f) => ({
		units: unitsLookup(f.trades),
		closes: f.closes,
		trades: [...f.trades].sort(tradeOrder)
	}));
	const flows = new Map<string, { cents: number; traded: boolean }>();
	for (const f of funds)
		for (const t of f.trades) {
			const cur = flows.get(t.date) ?? { cents: 0, traded: true };
			cur.cents += flowOf(t);
			flows.set(t.date, cur);
		}

	return [...dates]
		.filter((d) => d >= first && d <= today)
		.sort()
		.map((date) => {
			let valueCents = 0;
			for (const f of prepared) {
				const units = f.units(date);
				if (!units) continue;
				const close = closeOnOrBefore(f.closes, date);
				let priceE4 = close?.closeE4;
				if (priceE4 == null) {
					const t = f.trades.filter((x) => x.date <= date && x.side === 'buy').at(-1);
					priceE4 = t ? Math.round((t.valueCents * 1e8) / t.unitsE6) : 0;
				}
				valueCents += valueOf(units, priceE4);
			}
			const flow = flows.get(date);
			return { date, valueCents, flowCents: flow?.cents ?? 0, traded: !!flow };
		});
}

/** Monday of the week holding a date. */
const weekOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

/**
 * Keep every day from `dailyFrom` on and one point per week before it (the week's last
 * day, with the week's money in and out added up), so years of history stay small.
 */
export function downsample(points: ValuePoint[], dailyFrom: string): ValuePoint[] {
	const out: ValuePoint[] = [];
	let week = '';
	for (const p of points) {
		if (p.date >= dailyFrom) {
			out.push(p);
			continue;
		}
		const w = weekOf(p.date);
		const last = out[out.length - 1];
		if (w === week && last) {
			out[out.length - 1] = {
				date: p.date,
				valueCents: p.valueCents,
				flowCents: last.flowCents + p.flowCents,
				traded: last.traded || p.traded
			};
		} else {
			out.push({ ...p });
			week = w;
		}
	}
	return out;
}

/** Days of history kept day by day; more than a "1Y" range needs. */
const DAILY_DAYS = 400;

export interface Performance {
	/** The whole portfolio's move; null when nothing can be compared. */
	change: (DayChange & { label: string }) | null;
	/** Each fund's own move, by instrument id. */
	perFund: Map<number, DayChange>;
	series: ValuePoint[];
}

function closesOf(instrumentId: number): Close[] {
	return db
		.select({ date: schema.prices.date, closeE4: schema.prices.closeE4 })
		.from(schema.prices)
		.where(eq(schema.prices.instrumentId, instrumentId))
		.orderBy(asc(schema.prices.date))
		.all();
}

export function performance(today = localDate()): Performance {
	const records = db
		.select()
		.from(schema.instruments)
		.all()
		.map((instrument) => {
			let closes = closesOf(instrument.id);
			// A price typed in by hand is today's price, as everywhere else.
			if (instrument.manualPriceE4 != null)
				closes = [
					...closes.filter((c) => c.date < today),
					{ date: today, closeE4: instrument.manualPriceE4 }
				];
			return { instrument, trades: tradesOf(instrument.id), closes };
		});
	const perFund = new Map<number, DayChange>();
	for (const r of records) {
		// When the fund is valued from its last trade (no feed price since), there's no
		// earlier close to compare with, so no daily move.
		if (priceOn(r.instrument, null)?.source === 'trade') continue;
		const c = dayChange(r.trades, r.closes);
		if (!c) continue;
		// A fund sold out before that day has nothing to say about it.
		const lastTrade = r.trades.reduce((d, t) => (t.date > d ? t.date : d), '');
		if (!unitsLookup(r.trades)(today) && lastTrade < c.date) continue;
		perFund.set(r.instrument.id, c);
	}
	const sum = sumChanges([...perFund.values()]);
	return {
		change: sum ? { ...sum, label: dayLabel(sum.date, today) } : null,
		perFund,
		series: downsample(valueSeries(records, today), addDays(today, -DAILY_DAYS))
	};
}
