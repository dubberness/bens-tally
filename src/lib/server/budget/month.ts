import { and, eq, gte, inArray, isNull, lte, sql, desc, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';
import { addMonths, localDate, localMonth } from '$lib/time';
import type { Action } from '$lib/budget/rules';
import { summarise, NO_LABEL, type SpendRow } from './spending';
import { activeIn, allLines, lastPlanChange, planFor, paySplits, yearlyBills } from './lines';
import { budgetSetting, BUDGET_SETTINGS, type PayFrequency } from './settings';
import { realTransfersIn, regularPay, type RegularPay } from './pay';

export interface TxView {
	id: string;
	date: string;
	description: string;
	amountCents: number;
	category: string | null;
	accountId: number | null;
	accountName: string | null;
	action: Action | null;
	budgetLineId: number | null;
	label: string | null;
	byHand: boolean;
	ruleId: number | null;
	ruleName: string | null;
}

const t = schema.transactions;
const a = schema.assignments;

/** Transactions with what they count as, newest first. */
export function txViews(where: SQL | undefined, limit?: number): TxView[] {
	const q = db
		.select({
			id: t.id,
			date: t.date,
			description: t.description,
			amountCents: t.amountCents,
			category: t.category,
			accountId: t.accountId,
			accountName: schema.accounts.name,
			action: a.action,
			budgetLineId: a.budgetLineId,
			label: a.note,
			byHand: a.byHand,
			ruleId: a.ruleId,
			ruleName: schema.rules.name
		})
		.from(t)
		.leftJoin(a, eq(a.transactionId, t.id))
		.leftJoin(schema.rules, eq(schema.rules.id, a.ruleId))
		.leftJoin(schema.accounts, eq(schema.accounts.id, t.accountId))
		.where(where)
		.orderBy(desc(t.date), desc(t.createdAt));
	const rows = limit ? q.limit(limit).all() : q.all();
	return rows.map((r) => ({
		...r,
		action: (r.action as Action | null) ?? null,
		byHand: !!r.byHand
	}));
}

export const inMonth = (month: string) =>
	and(gte(t.date, `${month}-01`), lte(t.date, `${month}-31`));

export function monthTransactions(month: string): TxView[] {
	return txViews(inMonth(month));
}

const toRow = (v: TxView): SpendRow => ({
	id: v.id,
	amountCents: v.amountCents,
	action: v.action,
	budgetLineId: v.budgetLineId,
	label: v.label
});

export interface MerchantTotal {
	name: string;
	cents: number;
	count: number;
}

/** Money per merchant (positive = out), biggest first. */
export function byMerchant(rows: TxView[]): MerchantTotal[] {
	const m = new Map<string, MerchantTotal>();
	for (const r of rows) {
		const e = m.get(r.description) ?? { name: r.description, cents: 0, count: 0 };
		e.cents -= r.amountCents;
		e.count++;
		m.set(r.description, e);
	}
	return [...m.values()].sort((x, y) => Math.abs(y.cents) - Math.abs(x.cents));
}

/** First month with transactions, for the month switcher. */
export function firstTxMonth(): string | null {
	const row = db
		.select({ d: sql<string>`min(${t.date})` })
		.from(t)
		.get();
	return row?.d ? row.d.slice(0, 7) : null;
}

/** Average monthly living spend over the last `months` complete months (for the Plan). */
export function averageSpending(months = 12, includeOneOffs = true, asOf = localMonth()) {
	const first = firstTxMonth();
	if (!first) return null;
	const list: { month: string; cents: number }[] = [];
	for (let i = 1; i <= months; i++) {
		const m = addMonths(asOf, -i);
		if (m < first) break;
		list.push({
			month: m,
			cents: summarise(monthTransactions(m).map(toRow), { includeOneOffs }).spendingCents
		});
	}
	if (!list.length) return null;
	return {
		cents: Math.round(list.reduce((s, x) => s + x.cents, 0) / list.length),
		months: list.length,
		from: list[list.length - 1].month,
		to: list[0].month
	};
}

/** Average monthly investing over the last `months` complete months. */
export function averageInvesting(months = 3, asOf = localMonth()) {
	const first = firstTxMonth();
	if (!first) return null;
	let total = 0;
	let n = 0;
	for (let i = 1; i <= months; i++) {
		const m = addMonths(asOf, -i);
		if (m < first) break;
		total += summarise(monthTransactions(m).map(toRow)).investingCents;
		n++;
	}
	return n ? { cents: Math.round(total / n), months: n } : null;
}

export interface LineView {
	id: number;
	name: string;
	group: string;
	planCents: number;
	actualCents: number;
	keptCents: number;
	merchants: MerchantTotal[];
	count: number;
}

export interface LeftOut {
	key: string;
	title: string;
	cents: number;
	merchants: MerchantTotal[];
	href?: string;
}

export interface SaverSplit {
	accountId: number;
	name: string;
	colour: string | null;
	planCents: number | null;
	realCents: number;
}

export interface PayView {
	regular: RegularPay | null;
	splits: SaverSplit[];
	totalCents: number;
	planPayCents: number | null;
}

export interface BudgetMonth {
	month: string;
	prev: string | null;
	next: string | null;
	includeOneOffs: boolean;
	summary: {
		spendingCents: number;
		incomeCents: number;
		repaymentsCents: number;
		investingCents: number;
		oneOffCents: number;
		unassignedOutCents: number;
		savingsRate: number | null;
	};
	leftOut: LeftOut[];
	lines: LineView[];
	keptLines: LineView[];
	unassignedOut: { cents: number; merchants: MerchantTotal[]; count: number };
	yearly: {
		lineIds: number[];
		inCents: number;
		paidCents: number;
		paid: MerchantTotal[];
		balanceCents: number;
		since: string | null;
		due: { name: string; yearlyCents: number }[];
	} | null;
	people: { label: string; outCents: number; inCents: number; merchants: MerchantTotal[] }[];
	unassigned: TxView[];
	planSet: string | null;
	pay: PayView;
}

export function budgetMonth(month: string, includeOneOffs: boolean): BudgetMonth {
	const txs = monthTransactions(month);
	const s = summarise(txs.map(toRow), { includeOneOffs });
	const lines = allLines();
	const bills = yearlyBills();
	const yearlyIds = [
		...new Set(bills.map((b) => b.budgetLineId).filter((x): x is number => x != null))
	];

	const lineViews: LineView[] = lines
		.filter((l) => activeIn(l, month) || s.lineSpend.has(l.id) || s.lineKept.has(l.id))
		.map((l) => {
			const rows = txs.filter((x) => x.budgetLineId === l.id && x.action !== 'transfer');
			return {
				id: l.id,
				name: l.name,
				group: l.group,
				planCents: planFor(l.id, month),
				actualCents: s.lineSpend.get(l.id) ?? 0,
				keptCents: s.lineKept.get(l.id) ?? 0,
				merchants: byMerchant(rows),
				count: rows.length
			};
		});
	const isKept = (l: LineView) =>
		l.group === 'savings' || l.group === 'investing' || (l.keptCents > 0 && l.actualCents === 0);
	const living = lineViews.filter((l) => !yearlyIds.includes(l.id) && !isKept(l));
	const kept = lineViews.filter((l) => !yearlyIds.includes(l.id) && isKept(l));

	const leftOut: LeftOut[] = [];
	const group = (key: string, title: string, rows: TxView[], href?: string) => {
		if (!rows.length) return;
		const merchants = byMerchant(rows);
		leftOut.push({
			key,
			title,
			cents: merchants.reduce((x, m) => x + m.cents, 0),
			merchants,
			href
		});
	};
	group(
		'repayment',
		'Loan and mortgage repayments',
		txs.filter((x) => x.action === 'repayment')
	);
	group(
		'investing',
		'Investing',
		txs.filter((x) => x.action === 'investing')
	);
	if (!includeOneOffs)
		group(
			'one_off',
			'One-offs',
			txs.filter((x) => x.action === 'one_off')
		);
	for (const p of s.otherPeople) {
		if (!p.outCents) continue;
		group(
			`person:${p.label}`,
			`Paid for ${p.label}`,
			txs.filter(
				(x) =>
					x.action === 'other_person' &&
					(x.label?.trim() || NO_LABEL) === p.label &&
					x.amountCents < 0
			)
		);
	}

	const unassigned = txs.filter((x) => x.action === null);
	const unOut = unassigned.filter((x) => x.amountCents < 0);

	let yearly: BudgetMonth['yearly'] = null;
	if (yearlyIds.length) {
		const yRows = txs.filter((x) => x.budgetLineId != null && yearlyIds.includes(x.budgetLineId));
		const paid = byMerchant(yRows);
		const since =
			budgetSetting<string | null>(BUDGET_SETTINGS.yearlyFundStart) ?? firstTxMonth() ?? month;
		let balance = budgetSetting<number>(BUDGET_SETTINGS.yearlyFundOpening) ?? 0;
		if (since <= month) {
			const spent = db
				.select({
					m: sql<string>`substr(${t.date}, 1, 7)`,
					cents: sql<number>`sum(-${t.amountCents})`
				})
				.from(t)
				.innerJoin(a, eq(a.transactionId, t.id))
				.where(
					and(
						inArray(a.budgetLineId, yearlyIds),
						gte(t.date, `${since}-01`),
						lte(t.date, `${month}-31`)
					)
				)
				.groupBy(sql`substr(${t.date}, 1, 7)`)
				.all();
			const spentBy = new Map(spent.map((r) => [r.m, r.cents]));
			for (let m = since; m <= month; m = addMonths(m, 1)) {
				for (const id of yearlyIds) balance += planFor(id, m);
				balance -= spentBy.get(m) ?? 0;
			}
		}
		const monthNo = Number(month.slice(5, 7));
		yearly = {
			lineIds: yearlyIds,
			inCents: yearlyIds.reduce((x, id) => x + planFor(id, month), 0),
			paidCents: paid.reduce((x, m) => x + m.cents, 0),
			paid,
			balanceCents: balance,
			since: since <= month ? since : null,
			due: bills
				.filter((b) => (b.months ?? []).includes(monthNo))
				.map((b) => ({ name: b.name, yearlyCents: b.yearlyCents }))
		};
	}

	const people = s.otherPeople.map((p) => ({
		...p,
		merchants: byMerchant(
			txs.filter(
				(x) =>
					x.action === 'other_person' &&
					(x.label?.trim() || NO_LABEL) === p.label &&
					x.amountCents < 0
			)
		)
	}));

	const first = firstTxMonth();
	const current = localMonth();
	const firstPlan = lines.length
		? (db
				.select({ m: sql<string>`min(${schema.budgetAmounts.fromMonth})` })
				.from(schema.budgetAmounts)
				.get()?.m ?? null)
		: null;
	const earliest = [first, firstPlan].filter(Boolean).sort()[0] ?? current;

	return {
		month,
		prev: month > earliest ? addMonths(month, -1) : null,
		next: month < current ? addMonths(month, 1) : null,
		includeOneOffs,
		summary: {
			spendingCents: s.spendingCents,
			incomeCents: s.incomeCents,
			repaymentsCents: s.repaymentsCents,
			investingCents: s.investingCents,
			oneOffCents: s.oneOffCents,
			unassignedOutCents: s.unassignedOutCents,
			savingsRate: s.savingsRate
		},
		leftOut,
		lines: living,
		keptLines: kept,
		unassignedOut: {
			cents: s.unassignedOutCents,
			merchants: byMerchant(unOut),
			count: unOut.length
		},
		yearly,
		people,
		unassigned,
		planSet: lastPlanChange(),
		pay: payView(month)
	};
}

/** The planned split per saver beside what each really receives. */
export function payView(month?: string): PayView {
	const asOf = month && month < localMonth() ? `${month}-31` : localDate();
	const regular = regularPay(asOf > localDate() ? localDate() : asOf);
	const freq = regular?.frequency ?? budgetSetting<PayFrequency>(BUDGET_SETTINGS.payFrequency);
	const real = realTransfersIn(freq, asOf > localDate() ? localDate() : asOf);
	const accounts = new Map(
		db
			.select()
			.from(schema.accounts)
			.all()
			.map((x) => [x.id, x])
	);
	const splits: SaverSplit[] = paySplits().map((p) => ({
		accountId: p.accountId,
		name: accounts.get(p.accountId)?.name ?? 'Unknown account',
		colour: accounts.get(p.accountId)?.colour ?? null,
		planCents: p.amountCents,
		realCents: real.get(p.accountId) ?? 0
	}));
	const planned = new Set(splits.map((x) => x.accountId));
	const tolerance = budgetSetting<number>(BUDGET_SETTINGS.tolerance);
	for (const [id, cents] of real) {
		// Savers outside the plan only show when they really get more than pocket change.
		if (planned.has(id) || id === regular?.accountId || cents <= tolerance) continue;
		const acc = accounts.get(id);
		if (!acc) continue;
		splits.push({
			accountId: id,
			name: acc.name,
			colour: acc.colour,
			planCents: null,
			realCents: cents
		});
	}
	return {
		regular,
		splits,
		totalCents: splits.reduce((x, p) => x + (p.planCents ?? 0), 0),
		planPayCents: budgetSetting<number | null>(BUDGET_SETTINGS.planPay)
	};
}

/** Transactions assigned to a line in a month (or unassigned money out when lineId is null). */
export function lineTransactions(lineId: number | null, month: string): TxView[] {
	if (lineId == null)
		return txViews(and(inMonth(month), isNull(a.action), sql`${t.amountCents} < 0`));
	return txViews(and(inMonth(month), eq(a.budgetLineId, lineId)));
}

export function personTransactions(label: string, month: string): TxView[] {
	return txViews(and(inMonth(month), eq(a.action, 'other_person'))).filter(
		(x) => (x.label?.trim() || NO_LABEL) === label
	);
}

export function actionTransactions(action: Action, month: string): TxView[] {
	return txViews(and(inMonth(month), eq(a.action, action)));
}
