import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { getSetting } from '../settings';
import { holdings, type Holding } from './holdings';

export const DRIFT_KEY = 'invest.drift_band_bp';
/** How far a fund's share may stray from its target before a check says so (5 points). */
export const driftBandBp = () => getSetting<number>(DRIFT_KEY) ?? 500;

/** Chart colours handed out by size, biggest first; no colour belongs to a fund. */
const PALETTE = ['var(--c-etf)', 'var(--c-cash)', 'var(--c-super)', 'var(--c-home)'];
const FADED = 'var(--text-3)';

export interface MixRow {
	ticker: string;
	nowBp: number;
	targetBp: number | null;
	colour: string;
}

export interface Portfolio {
	held: Holding[];
	valueCents: number;
	costCents: number;
	realisedCents: number;
	distributionsCents: number;
	mix: MixRow[];
	colours: Map<number, string>;
	priced: { date: string | null; source: string | null; fetchedAt: Date | null };
}

export function portfolio(): Portfolio {
	const all = holdings(null);
	const held = all
		.filter((h) => h.unitsE6 > 0)
		.sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0));
	const valueCents = held.reduce((s, h) => s + (h.valueCents ?? 0), 0);
	const costCents = held.reduce((s, h) => s + h.costCents, 0);
	const realisedCents = all.reduce(
		(s, h) => s + h.lots.disposals.reduce((t, d) => t + d.gainCents, 0),
		0
	);
	const distributionsCents =
		db
			.select({ amount: schema.distributions.amountCents })
			.from(schema.distributions)
			.all()
			.reduce((s, d) => s + d.amount, 0) ?? 0;

	const colours = new Map<number, string>();
	held.forEach((h, i) => colours.set(h.instrument.id, PALETTE[i % PALETTE.length]));
	const mix: MixRow[] = held.map((h) => ({
		ticker: h.instrument.ticker,
		nowBp: valueCents ? Math.round(((h.valueCents ?? 0) / valueCents) * 10_000) : 0,
		targetBp: h.instrument.targetBp,
		colour: colours.get(h.instrument.id)!
	}));
	for (const h of all)
		if (h.unitsE6 === 0 && h.instrument.targetBp)
			mix.push({
				ticker: h.instrument.ticker,
				nowBp: 0,
				targetBp: h.instrument.targetBp,
				colour: FADED
			});

	const latest = db
		.select()
		.from(schema.prices)
		.orderBy(desc(schema.prices.fetchedAt))
		.limit(1)
		.get();
	const dates = held.map((h) => h.price?.date).filter((d): d is string => !!d);
	return {
		held,
		valueCents,
		costCents,
		realisedCents,
		distributionsCents,
		mix,
		colours,
		priced: {
			date: dates.length ? dates.sort()[0] : null,
			source: latest?.source ?? null,
			fetchedAt: latest?.fetchedAt ?? null
		}
	};
}

export interface MixProblem {
	key: string;
	message: string;
	fingerprint: string;
}

/** Targets for funds not held, held funds without targets, drift past the band. */
export function mixProblems(p: Portfolio = portfolio()): MixProblem[] {
	const out: MixProblem[] = [];
	const band = driftBandBp();
	const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%`;
	for (const m of p.mix) {
		if (m.nowBp === 0 && m.targetBp)
			out.push({
				key: `invest:target-not-held:${m.ticker}`,
				message: `You hold no ${m.ticker} but it still has a ${pct(m.targetBp)} target.`,
				fingerprint: String(m.targetBp)
			});
		else if (m.targetBp == null)
			out.push({
				key: `invest:no-target:${m.ticker}`,
				message: `${m.ticker} has no target.`,
				fingerprint: 'none'
			});
		else if (Math.abs(m.nowBp - m.targetBp) > band)
			out.push({
				key: `invest:drift:${m.ticker}`,
				message: `${m.ticker} is ${pct(m.nowBp)} of the portfolio against a ${pct(m.targetBp)} target.`,
				fingerprint: `${m.targetBp}:${Math.round(m.nowBp / 100)}`
			});
	}
	const total = p.mix.reduce((s, m) => s + (m.targetBp ?? 0), 0);
	if (total && total !== 10_000)
		out.push({
			key: 'invest:targets-total',
			message: `Targets add up to ${pct(total)}, not 100%.`,
			fingerprint: String(total)
		});
	return out;
}

export interface ActivityRow {
	key: string;
	/** Where to edit it. */
	href: string;
	date: string;
	kind: 'buy' | 'sell' | 'distribution';
	ticker: string;
	unitsE6: number | null;
	priceE4: number | null;
	perUnitE6: number | null;
	amountCents: number;
	reinvested: boolean;
	source: string;
	note: string | null;
}

export interface ActivityFilter {
	instrumentId?: number | null;
	kind?: 'trades' | 'distributions' | null;
}

/** Trades and distributions, newest first. */
export function activity(limit = 30, filter: ActivityFilter = {}): ActivityRow[] {
	const fund = filter.instrumentId ?? null;
	const trades =
		filter.kind === 'distributions'
			? []
			: db
					.select({ t: schema.trades, ticker: schema.instruments.ticker })
					.from(schema.trades)
					.innerJoin(schema.instruments, eq(schema.trades.instrumentId, schema.instruments.id))
					.where(fund == null ? undefined : eq(schema.trades.instrumentId, fund))
					.orderBy(desc(schema.trades.date), desc(schema.trades.id))
					.limit(limit)
					.all()
					.map(({ t, ticker }): ActivityRow => ({
						key: `t${t.id}`,
						href: `/invest/trades/${t.id}`,
						date: t.date,
						kind: t.side as 'buy' | 'sell',
						ticker,
						unitsE6: t.unitsE6,
						priceE4: t.priceE4,
						perUnitE6: null,
						amountCents: t.side === 'buy' ? t.valueCents + t.feeCents : t.valueCents - t.feeCents,
						reinvested: false,
						source: t.source,
						note: t.note
					}));
	const dists =
		filter.kind === 'trades'
			? []
			: db
					.select({ d: schema.distributions, ticker: schema.instruments.ticker })
					.from(schema.distributions)
					.innerJoin(
						schema.instruments,
						eq(schema.distributions.instrumentId, schema.instruments.id)
					)
					.where(fund == null ? undefined : eq(schema.distributions.instrumentId, fund))
					.orderBy(desc(schema.distributions.date), desc(schema.distributions.id))
					.limit(limit)
					.all()
					.map(({ d, ticker }): ActivityRow => ({
						key: `d${d.id}`,
						href: `/invest/distributions/${d.id}`,
						date: d.date,
						kind: 'distribution',
						ticker,
						unitsE6: d.unitsE6,
						priceE4: null,
						perUnitE6: d.perUnitE6,
						amountCents: d.amountCents,
						reinvested: d.reinvested,
						source: d.source,
						note: d.note
					}));
	return [...trades, ...dists]
		.sort((a, b) => (a.date === b.date ? (a.key < b.key ? 1 : -1) : a.date < b.date ? 1 : -1))
		.slice(0, limit);
}
