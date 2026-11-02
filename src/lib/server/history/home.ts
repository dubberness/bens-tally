import { localDate, monthEnd, monthName } from '$lib/time';
import { formatMoneyShort } from '$lib/money';
import { runChecks } from '../checks';
import type { Breakdown } from './breakdown';
import {
	allAccounts,
	boughtAtCost,
	breakdownBetween,
	centsOf,
	isOpenOn,
	lastLocked,
	lockedSnapshots,
	monthToClose,
	netWorthOf,
	snapshotValues,
	valuesOn
} from './snapshots';
import { badgeText, breakdownView, colourFor, detailFor, KIND_LABEL, upcomingEvents } from './view';

export interface ChartPoint {
	/** 'YYYY-MM' or 'now'. */
	key: string;
	label: string;
	all: number;
	inv: number;
	/** Estimate change in this month, in cents (0 = none). */
	estimate: number;
	estimateNote: string;
}

export interface AccountRow {
	id: number;
	name: string;
	detail: string;
	valueCents: number;
	side: string;
	kind: string;
	colour: string;
	badge: string;
	children?: AccountRow[];
}

/** Everything Home shows, from current data. Works on an empty database. */
export function homeData(today = localDate()) {
	const accounts = allAccounts();
	const names = new Map(accounts.map((a) => [a.id, a.name]));
	const live = valuesOn(null, accounts);
	const values = centsOf(live);
	const netWorth = netWorthOf(values, accounts);
	const investable = netWorthOf(values, accounts, (a) => a.investable);
	const open = accounts.filter((a) => isOpenOn(a, today));

	// Change since the last locked month.
	const last = lastLocked();
	let change: null | {
		month: string;
		all: number;
		estimates: number;
		inv: number;
		invParts: { label: string; cents: number }[];
	} = null;
	if (last) {
		const prev = snapshotValues(last.month);
		const from = monthEnd(last.month);
		const b = breakdownBetween({
			prevMonth: last.month,
			prev,
			curr: values,
			bought: boughtAtCost(from, today),
			from,
			to: today,
			accounts
		});
		const invParts = new Map<string, number>();
		for (const a of accounts) {
			if (!a.investable) continue;
			const d =
				(a.side === 'liability' ? -1 : 1) * ((values.get(a.id) ?? 0) - (prev.get(a.id) ?? 0));
			const label = a.kind === 'investment' ? 'ETFs' : (KIND_LABEL[a.kind] ?? a.kind);
			invParts.set(label, (invParts.get(label) ?? 0) + d);
		}
		change = {
			month: last.month,
			all: netWorth - (last.netWorthCents ?? 0),
			estimates: b.estimates,
			inv: investable - netWorthOf(prev, accounts, (a) => a.investable),
			invParts: [...invParts].map(([label, cents]) => ({ label, cents }))
		};
	}

	// Chart: every locked month plus today.
	const chart: ChartPoint[] = lockedSnapshots().map((s) => {
		const b = s.breakdown as Breakdown | null;
		const v = snapshotValues(s.month);
		return {
			key: s.month,
			label: monthName(s.month),
			all: s.netWorthCents ?? 0,
			inv: netWorthOf(v, accounts, (a) => a.investable),
			estimate: b?.estimates ?? 0,
			estimateNote: (b?.estimateItems ?? [])
				.map((e) => `${e.name} ${formatMoneyShort(e.cents, { sign: true })}`)
				.join(', ')
		};
	});
	if (open.length)
		chart.push({
			key: 'now',
			label: 'Now',
			all: netWorth,
			inv: investable,
			estimate: change?.estimates ?? 0,
			estimateNote: ''
		});

	// What you own and owe. Several accounts of one asset kind (cash savers) share a row.
	let debtIndex = 0;
	const rows: AccountRow[] = [];
	const groups = new Map<string, AccountRow>();
	for (const a of open) {
		const v = live.get(a.id);
		const row: AccountRow = {
			id: a.id,
			name: a.name,
			detail: detailFor(a, names),
			valueCents: v?.valueCents ?? 0,
			side: a.side,
			kind: a.kind,
			colour: colourFor(a, a.side === 'liability' ? debtIndex++ : 0),
			badge: a.kind === 'property' && v && v.badge !== 'calculated' ? 'Estimate' : badgeText(v)
		};
		const sameKind = open.filter((o) => o.kind === a.kind && o.side === a.side).length;
		if (a.side === 'asset' && a.kind === 'cash' && sameKind > 1) {
			let g = groups.get(a.kind);
			if (!g) {
				g = {
					id: 0,
					name: KIND_LABEL[a.kind],
					detail: '',
					valueCents: 0,
					side: a.side,
					kind: a.kind,
					colour: row.colour,
					badge: '',
					children: []
				};
				groups.set(a.kind, g);
				rows.push(g);
			}
			g.children!.push(row);
			g.valueCents += row.valueCents;
		} else rows.push(row);
	}
	for (const g of groups.values()) {
		g.detail = `${g.children!.length} accounts`;
		const badges = new Set(g.children!.map((c) => c.badge.split(' · ')[0]));
		g.badge = badges.size === 1 ? g.children![0].badge : 'Mixed';
	}
	const owned = rows.filter((r) => r.side === 'asset').reduce((s, r) => s + r.valueCents, 0);
	const owed = rows.filter((r) => r.side === 'liability').reduce((s, r) => s + r.valueCents, 0);

	const lastB = last ? breakdownView(last.breakdown as Breakdown | null) : null;

	return {
		hasData: open.length > 0,
		netWorth,
		investable,
		change,
		chart,
		events: upcomingEvents(3, today),
		rows,
		owned,
		owed,
		lastMonth: last ? { month: last.month, name: monthName(last.month), breakdown: lastB } : null,
		checks: runChecks(),
		toClose: monthToClose(today)
	};
}
