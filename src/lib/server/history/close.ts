import { addDays, localDate, monthEnd } from '$lib/time';
import { accountValue, latestBalance } from '../ledger/value';
import { getCalculation } from './calculated';
import { expectedLoanBalance, type LoanTermsParams } from './schedule';
import { sureThresholdBp } from './prefs';
import {
	allAccounts,
	boughtAtCost,
	isOpenOn,
	lastLocked,
	lockedSnapshots,
	monthToClose,
	snapshotValues
} from './snapshots';
import { badgeText, detailFor, KIND_LABEL } from './view';

export interface CloseItem {
	/** 'auto' fills itself; 'manual' is typed; 'estimate' is keep-or-update (a home value). */
	type: 'auto' | 'manual' | 'estimate';
	ids: number[];
	name: string;
	detail: string;
	side: string;
	valueCents: number | null;
	lastMonthCents: number | null;
	expectedCents: number | null;
	/** A value already entered for the month's last day. */
	enteredCents: number | null;
	/** The latest value on or before the month's end, and its date. */
	currentCents: number | null;
	currentAsOf: string | null;
	note: string;
}

/** Everything the Close the month screen needs for `month` (default: the one due). */
export function closeData(today = localDate(), month?: string) {
	const due = monthToClose(today);
	const target = month ?? due?.month ?? null;
	const prev = lastLocked();
	const accounts = allAccounts();
	const names = new Map(accounts.map((a) => [a.id, a.name]));
	if (!target) {
		return {
			month: null,
			due,
			prevMonth: prev?.month ?? null,
			items: [],
			others: 0,
			prevNetWorth: null,
			count: lockedSnapshots().length,
			sureBp: sureThresholdBp()
		};
	}
	const end = monthEnd(target);
	const prevValues = prev ? snapshotValues(prev.month) : new Map<number, number>();
	const open = accounts.filter((a) => isOpenOn(a, end));
	const listed = open
		.filter((a) => a.closeOrder != null)
		.sort((a, b) => (a.closeOrder ?? 0) - (b.closeOrder ?? 0) || a.id - b.id);
	const unlisted = open.filter((a) => a.closeOrder == null);

	const items: CloseItem[] = [];
	const cashGroup: CloseItem = {
		type: 'auto',
		ids: [],
		name: KIND_LABEL.cash,
		detail: '',
		side: 'asset',
		valueCents: 0,
		lastMonthCents: 0,
		expectedCents: null,
		enteredCents: null,
		currentCents: null,
		currentAsOf: null,
		note: ''
	};
	for (const a of listed) {
		const v = accountValue(a, end);
		const last = prevValues.get(a.id) ?? null;
		const auto = a.source !== 'manual';
		if (
			auto &&
			a.kind === 'cash' &&
			a.side === 'asset' &&
			listed.filter((o) => o.kind === 'cash' && o.source !== 'manual').length > 1
		) {
			if (!cashGroup.ids.length) items.push(cashGroup);
			cashGroup.ids.push(a.id);
			cashGroup.valueCents! += v?.valueCents ?? 0;
			cashGroup.lastMonthCents! += last ?? 0;
			continue;
		}
		const onEnd = latestBalance(a.id, end);
		const entered =
			onEnd && onEnd.asOf === end && onEnd.badge !== 'sheet' ? onEnd.valueCents : null;
		let expected: number | null = null;
		const calc = getCalculation(a.id);
		if (!auto && calc?.kind === 'loan_terms' && onEnd) {
			// Expect from the balance before any figure already typed for this month end.
			const from = entered != null ? latestBalance(a.id, addDays(end, -1)) : onEnd;
			if (from)
				expected = expectedLoanBalance(
					{ date: from.asOf, valueCents: from.valueCents },
					calc.params as LoanTermsParams,
					end
				);
		}
		const type: CloseItem['type'] = auto ? 'auto' : a.kind === 'property' ? 'estimate' : 'manual';
		items.push({
			type,
			ids: [a.id],
			name: a.name,
			detail: auto ? `${badgeText(v)} · ${detailFor(a, names)}` : detailFor(a, names),
			side: a.side,
			valueCents: v?.valueCents ?? null,
			lastMonthCents: last,
			expectedCents: expected,
			enteredCents: entered,
			currentCents: v?.valueCents ?? null,
			currentAsOf: v?.asOf ?? null,
			note: a.note ?? ''
		});
	}
	if (cashGroup.ids.length) cashGroup.detail = `${cashGroup.ids.length} accounts`;

	// Accounts left off the list still count, at their own values.
	let others = 0;
	for (const a of unlisted) {
		const v = accountValue(a, end);
		if (v) others += a.side === 'liability' ? -v.valueCents : v.valueCents;
	}
	return {
		month: target,
		due,
		prevMonth: prev?.month ?? null,
		items,
		others,
		prevNetWorth: prev?.netWorthCents ?? null,
		bought: prev ? boughtAtCost(monthEnd(prev.month), end) : 0,
		count: lockedSnapshots().length,
		sureBp: sureThresholdBp()
	};
}
