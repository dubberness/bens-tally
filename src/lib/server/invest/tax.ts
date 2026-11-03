import { asc, eq } from 'drizzle-orm';
import { toCsv } from '$lib/csv';
import { addMonths, financialYear, localDate, monthName, sameDayInMonth } from '$lib/time';
import { db, schema } from '../db';
import { holdings } from './holdings';
import type { Disposal } from './lots';

/*
 * Capital gains. A gain gets the discount when the parcel was held longer than the
 * holding period of the tax rule in force on the sale date. Per financial year (1 July
 * to 30 June): this year's losses, then losses carried forward, come off the gains that
 * get no discount first (the order that leaves the least to pay), then the discount
 * applies to what's left; a net loss carries forward.
 */

export type TaxRule = typeof schema.taxRules.$inferSelect;

/** Starting rule for anyone: 50% off gains on parcels held over 12 months. Editable. */
const SEED = { fromDate: '1999-09-21', discountBp: 5000, holdingMonths: 12 };

/** The rules, oldest first; seeds the starting rule the first time. */
export function taxRules(): TaxRule[] {
	const rows = db.select().from(schema.taxRules).orderBy(asc(schema.taxRules.fromDate)).all();
	if (rows.length) return rows;
	const now = new Date();
	db.insert(schema.taxRules)
		.values({
			...SEED,
			note: 'Starting rule: half off gains on parcels held over a year',
			origin: 'seed',
			createdAt: now,
			updatedAt: now
		})
		.run();
	return db.select().from(schema.taxRules).orderBy(asc(schema.taxRules.fromDate)).all();
}

/** The rule in force on a date: the latest one that has started and not ended. */
export function ruleOn(rules: TaxRule[], date: string): TaxRule | null {
	let found: TaxRule | null = null;
	for (const r of rules) if (r.fromDate <= date && (!r.toDate || r.toDate >= date)) found = r;
	return found;
}

/** The first day a parcel bought on `date` counts as held longer than `months`. */
export function discountFrom(boughtOn: string, months: number): string {
	const same = sameDayInMonth(addMonths(boughtOn.slice(0, 7), months), Number(boughtOn.slice(8)));
	const d = new Date(`${same}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

export interface TaxedDisposal extends Disposal {
	ticker: string;
	discountBp: number;
}

/** Every sale matched to its parcels, with the discount it qualifies for. */
export function disposals(rules = taxRules()): TaxedDisposal[] {
	const out: TaxedDisposal[] = [];
	for (const h of holdings(null))
		for (const d of h.lots.disposals) {
			const rule = ruleOn(rules, d.date);
			const qualifies =
				!!rule && d.gainCents > 0 && d.date >= discountFrom(d.boughtOn, rule.holdingMonths);
			out.push({ ...d, ticker: h.instrument.ticker, discountBp: qualifies ? rule!.discountBp : 0 });
		}
	return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface TaxYear {
	label: string;
	start: string;
	end: string;
	/** Gains on parcels that get the discount, before it. */
	discountableCents: number;
	/** Gains that get no discount. */
	otherGainsCents: number;
	lossesCents: number;
	/** Losses brought in from earlier years. */
	broughtForwardCents: number;
	discountCents: number;
	/** What goes on the tax return: 0 when there's a net loss. */
	netGainCents: number;
	/** Loss left to carry into the next year. */
	carryForwardCents: number;
	/** Gains less losses this year, before anything else: the headline figure. */
	totalCents: number;
	disposals: TaxedDisposal[];
}

/** One entry per financial year with a sale, oldest first, each feeding the next. */
export function taxYears(list = disposals()): TaxYear[] {
	const byYear = new Map<string, TaxedDisposal[]>();
	for (const d of list) {
		const fy = financialYear(d.date).start;
		byYear.set(fy, [...(byYear.get(fy) ?? []), d]);
	}
	const years: TaxYear[] = [];
	let carried = 0;
	for (const start of [...byYear.keys()].sort()) {
		const items = byYear.get(start)!;
		const fy = financialYear(start);
		// Each disposal's discount can differ (a rule change mid-year), so keep them apart.
		const disc = items.filter((d) => d.gainCents > 0 && d.discountBp > 0);
		const other = items.filter((d) => d.gainCents > 0 && d.discountBp === 0);
		const losses = -items.filter((d) => d.gainCents < 0).reduce((s, d) => s + d.gainCents, 0);
		let toApply = losses + carried;
		const otherGains = other.reduce((s, d) => s + d.gainCents, 0);
		const fromOther = Math.min(toApply, otherGains);
		toApply -= fromOther;
		// Losses left go against the discountable gains, largest discount last.
		let discount = 0;
		let discLeft = 0;
		for (const d of [...disc].sort((a, b) => a.discountBp - b.discountBp)) {
			const used = Math.min(toApply, d.gainCents);
			toApply -= used;
			const left = d.gainCents - used;
			const off = Math.round((left * d.discountBp) / 10_000);
			discount += off;
			discLeft += left - off;
		}
		const discountable = disc.reduce((s, d) => s + d.gainCents, 0);
		years.push({
			label: fy.label,
			start: fy.start,
			end: fy.end,
			discountableCents: discountable,
			otherGainsCents: otherGains,
			lossesCents: losses,
			broughtForwardCents: carried,
			discountCents: discount,
			netGainCents: otherGains - fromOther + discLeft,
			carryForwardCents: toApply,
			totalCents: discountable + otherGains - losses,
			disposals: items
		});
		carried = toApply;
	}
	return years;
}

/** The year holding `date`, even with no sales yet (losses still come in). */
export function taxYearOf(date: string, years = taxYears()): TaxYear {
	const fy = financialYear(date);
	const found = years.find((y) => y.start === fy.start);
	if (found) return found;
	const before = years.filter((y) => y.start < fy.start).at(-1);
	const carried = before?.carryForwardCents ?? 0;
	return {
		label: fy.label,
		start: fy.start,
		end: fy.end,
		discountableCents: 0,
		otherGainsCents: 0,
		lossesCents: 0,
		broughtForwardCents: carried,
		discountCents: 0,
		netGainCents: 0,
		carryForwardCents: carried,
		totalCents: 0,
		disposals: []
	};
}

export interface OpenParcel {
	ticker: string;
	boughtOn: string;
	unitsE6: number;
	costCents: number;
	valueCents: number | null;
	/** First day a sale would get the discount; null when no rule gives one. */
	discountFrom: string | null;
}

/** Parcels still held, oldest first, with the day each passes the holding period. */
export function openParcels(rules = taxRules()): OpenParcel[] {
	const today = localDate();
	const out: OpenParcel[] = [];
	for (const h of holdings(null)) {
		if (!h.unitsE6) continue;
		for (const p of h.lots.parcels) {
			// The rule that would apply on the day the parcel passes its period.
			const now = ruleOn(rules, today);
			const from = now ? discountFrom(p.date, now.holdingMonths) : null;
			const then = from ? ruleOn(rules, from) : null;
			out.push({
				ticker: h.instrument.ticker,
				boughtOn: p.date,
				unitsE6: p.unitsE6,
				costCents: p.costCents,
				valueCents: h.price ? Math.round((p.unitsE6 * h.price.priceE4) / 1e8) : null,
				discountFrom: then && then.discountBp > 0 ? from : null
			});
		}
	}
	return out.sort((a, b) => (a.boughtOn < b.boughtOn ? -1 : 1));
}

export interface TaxDate {
	date: string;
	kind: 'discount' | 'rule';
	message: string;
}

/** What's coming up in the rest of this financial year: parcels passing 12 months, rule changes. */
export function upcomingTaxDates(rules = taxRules(), today = localDate()): TaxDate[] {
	const end = financialYear(today).end;
	const out: TaxDate[] = [];
	// One line per fund per month: weekly buys would otherwise fill the list.
	const groups = new Map<string, { ticker: string; units: number; count: number; first: string }>();
	for (const p of openParcels(rules)) {
		if (!p.discountFrom || p.discountFrom <= today || p.discountFrom > end) continue;
		const key = `${p.discountFrom.slice(0, 7)}|${p.ticker}`;
		const g = groups.get(key) ?? { ticker: p.ticker, units: 0, count: 0, first: p.discountFrom };
		g.units += p.unitsE6;
		g.count++;
		if (p.discountFrom < g.first) g.first = p.discountFrom;
		groups.set(key, g);
	}
	for (const g of groups.values()) {
		const units = (g.units / 1e6).toLocaleString('en-AU', { maximumFractionDigits: 2 });
		out.push({
			date: g.first,
			kind: 'discount',
			message:
				g.count === 1
					? `${units} ${g.ticker} units pass the holding period; a sale from here gets the discount.`
					: `${g.count} ${g.ticker} parcels (${units} units) pass the holding period from here through ${monthName(g.first.slice(0, 7), { year: false })}.`
		});
	}
	for (const r of rules) {
		if (r.fromDate > today && r.fromDate <= addYear(end))
			out.push({
				date: r.fromDate,
				kind: 'rule',
				message: `A new tax rule starts: ${r.discountBp / 100}% discount after ${r.holdingMonths} months${r.note ? ` (${r.note})` : ''}.`
			});
		if (r.toDate && r.toDate >= today && r.toDate <= addYear(end))
			out.push({
				date: r.toDate,
				kind: 'rule',
				message: `Last day of the ${r.discountBp / 100}% discount rule. Worth checking before you sell.`
			});
	}
	return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

const addYear = (date: string) => `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;

/** A financial year's sales as CSV, one row per parcel matched. */
export function taxYearCsv(year: TaxYear): string {
	const money = (c: number) => (c / 100).toFixed(2);
	const rows = [
		[
			'Sale date',
			'Fund',
			'Bought',
			'Units',
			'Cost base',
			'Proceeds',
			'Gain or loss',
			'Discount %',
			'Discounted gain'
		]
	];
	for (const d of year.disposals)
		rows.push([
			d.date,
			d.ticker,
			d.boughtOn,
			(d.unitsE6 / 1e6).toFixed(6),
			money(d.costCents),
			money(d.proceedsCents),
			money(d.gainCents),
			String(d.discountBp / 100),
			money(
				d.gainCents > 0
					? d.gainCents - Math.round((d.gainCents * d.discountBp) / 10_000)
					: d.gainCents
			)
		]);
	rows.push([]);
	rows.push(['Financial year', year.label]);
	rows.push(['Gains getting the discount (before it)', money(year.discountableCents)]);
	rows.push(['Other gains', money(year.otherGainsCents)]);
	rows.push(['Losses this year', money(year.lossesCents)]);
	rows.push(['Losses brought forward', money(year.broughtForwardCents)]);
	rows.push(['Discount', money(year.discountCents)]);
	rows.push(['Net capital gain', money(year.netGainCents)]);
	rows.push(['Loss to carry forward', money(year.carryForwardCents)]);
	return toCsv(rows);
}

/** For Manage › Tax rules. */
export function saveTaxRule(
	id: number | null,
	v: {
		fromDate: string;
		toDate: string | null;
		discountBp: number;
		holdingMonths: number;
		note: string | null;
	}
) {
	const now = new Date();
	if (id == null)
		db.insert(schema.taxRules)
			.values({ ...v, origin: 'app', createdAt: now, updatedAt: now })
			.run();
	else
		db.update(schema.taxRules)
			.set({ ...v, updatedAt: now })
			.where(eq(schema.taxRules.id, id))
			.run();
}

export function deleteTaxRule(id: number) {
	db.delete(schema.taxRules).where(eq(schema.taxRules.id, id)).run();
}
