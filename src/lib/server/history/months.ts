import { formatMoneyShort } from '$lib/money';
import { toCsv } from '$lib/csv';
import { daysBetween, localDate, localMonth, monthEnd, monthName, shortMonth } from '$lib/time';
import type { Breakdown } from './breakdown';
import {
	allAccounts,
	allSnapshots,
	getSnapshot,
	isOpenOn,
	lockedSnapshots,
	monthEdits,
	monthToClose,
	snapshotValues
} from './snapshots';
import { breakdownView, colourFor, KIND_LABEL } from './view';
import { latestBalance } from '../ledger/value';

/** "Home estimate +$150k", from a month's estimate items. */
function estimateLabel(b: Breakdown | null): string {
	if (!b?.estimateItems?.length) return '';
	return b.estimateItems
		.map((e) => `${e.name} ${formatMoneyShort(e.cents, { sign: true })}`)
		.join(', ');
}

export function monthsData(today = localDate()) {
	const locked = lockedSnapshots();
	const months = locked.map((s) => {
		const b = s.breakdown as Breakdown | null;
		const v = breakdownView(b);
		return {
			month: s.month,
			name: monthName(s.month),
			short: shortMonth(s.month),
			letter: monthName(s.month)[0],
			netWorth: s.netWorthCents ?? 0,
			mine: v?.mine ?? null,
			estimates: v?.estimates ?? 0,
			estimateLabel: estimateLabel(b),
			parts: v?.parts ?? null,
			estimateItems: v?.estimateItems ?? [],
			note: s.note,
			origin: s.origin
		};
	});
	const last12 = months.slice(-12);
	const yearMine = last12.reduce((s, m) => s + (m.mine ?? 0), 0);
	const yearEst = last12.reduce((s, m) => s + m.estimates, 0);
	const estNames = [...new Set(last12.flatMap((m) => m.estimateItems.map((e) => e.name)))];

	const current = localMonth();
	const toClose = monthToClose(today);
	const openSnap = getSnapshot(current);
	return {
		months,
		last12,
		yearMine,
		yearEst,
		estNames,
		toClose,
		nextClose: toClose
			? null
			: locked.length || openSnap
				? { month: current, days: daysBetween(today, monthEnd(current)) }
				: null,
		first: months[0]?.month ?? null,
		last: months[months.length - 1]?.month ?? null
	};
}

/** One month in full: breakdown, each account's value, note and edit history. */
export function monthDetail(month: string) {
	const snap = getSnapshot(month);
	if (!snap) return null;
	const accounts = allAccounts();
	const values = snapshotValues(month);
	const byId = new Map(accounts.map((a) => [a.id, a]));
	const b = snap.breakdown as Breakdown | null;
	const prevValues = b?.prevMonth ? snapshotValues(b.prevMonth) : new Map<number, number>();
	let debt = 0;
	const rows = accounts
		.filter((a) => values.has(a.id) || prevValues.has(a.id))
		.map((a) => ({
			id: a.id,
			name: a.name,
			kind: KIND_LABEL[a.kind] ?? a.kind,
			side: a.side,
			colour: colourFor(a, a.side === 'liability' ? debt++ : 0),
			valueCents: values.get(a.id) ?? null,
			prevCents: prevValues.get(a.id) ?? null
		}));
	const editName = (field: string) => {
		if (field === 'note') return 'Note';
		if (field === 'net_worth') return 'Net worth';
		if (field === 'bought') return 'Bought ETFs';
		const id = Number(field.split(':')[1]);
		return byId.get(id)?.name ?? 'An account';
	};
	const edits = monthEdits(month).map((e) => ({
		id: e.id,
		at: e.at.getTime(),
		what: editName(e.field),
		field: e.field,
		oldValue: e.oldValue,
		newValue: e.newValue,
		reason: e.reason
	}));
	const all = allSnapshots();
	const i = all.findIndex((s) => s.month === month);
	return {
		month,
		name: monthName(month),
		status: snap.status,
		origin: snap.origin,
		lockedAt: snap.lockedAt?.getTime() ?? null,
		netWorth: snap.netWorthCents ?? 0,
		note: snap.note,
		breakdown: breakdownView(b),
		prevMonth: b?.prevMonth ?? null,
		rows,
		edits,
		prev: i > 0 ? all[i - 1].month : null,
		next: i >= 0 && i < all.length - 1 ? all[i + 1].month : null
	};
}

const dollars = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

/** Every month as CSV: net worth, the breakdown, the note and each account's value. */
export function monthsCsv(): string {
	const accounts = allAccounts();
	const snaps = allSnapshots();
	const used = accounts.filter((a) =>
		snaps.some((s) => snapshotValues(s.month).has(a.id) || isOpenOn(a, monthEnd(s.month)))
	);
	const head = [
		'month',
		'status',
		'net_worth',
		'change',
		'saved_to_cash',
		'bought_etfs',
		'etf_markets',
		'super',
		'debt_paid_down',
		'estimates',
		'other',
		'note',
		...used.map((a) => `${a.name} (${a.side === 'liability' ? 'owed' : 'value'})`)
	];
	const rows: (string | null)[][] = [head];
	for (const s of snaps) {
		const b = s.breakdown as Breakdown | null;
		const v = snapshotValues(s.month);
		rows.push([
			s.month,
			s.status,
			dollars(s.netWorthCents),
			dollars(b?.total),
			dollars(b?.cash),
			dollars(b?.bought),
			dollars(b?.markets),
			dollars(b?.super),
			dollars(b?.debt),
			dollars(b?.estimates),
			dollars(b?.other),
			s.note,
			...used.map((a) => dollars(v.get(a.id)))
		]);
	}
	return toCsv(rows);
}

/** Latest entry for an account, for "last updated" lines. */
export const lastEntry = (accountId: number) => latestBalance(accountId, null);
