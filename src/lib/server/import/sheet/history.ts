import { and, eq, inArray } from 'drizzle-orm';
import { formatMoney } from '$lib/money';
import { addDays, localDate, monthEnd, monthName, monthsBetween } from '$lib/time';
import { db, schema } from '../../db';
import { findOrCreateAccount, type NewAccount } from '../../accounts';
import { serialToDate, type Cell, type Sheet } from '../xlsx';
import { cents, find, is, need, num, starts, text } from './cells';
import type { SheetArea, SheetContext } from './types';
import { boughtFromTrades, firstTradeDate } from '../../history/bought-from-trades';
import {
	breakdownBetween,
	refreshOpenMonth,
	snapshotValues,
	allAccounts
} from '../../history/snapshots';
import { partRows, type Breakdown } from '../../history/breakdown';
import { shareOf } from '../../history/schedule';

/*
 * History from the Personal Wealth sheet: accounts, a balance per month, and one locked
 * snapshot per month with its breakdown. Columns are found by their header text so a
 * moved column doesn't break it. Nothing here names a real account or figure: names and
 * numbers all come from the workbook.
 */

/** 'November 2025' or a date serial → '2025-11'. */
function monthOfCell(c: Cell): string | null {
	if (typeof c === 'number') return serialToDate(c).slice(0, 7);
	const m = text(c).match(/^([A-Za-z]+)\s+(\d{4})$/);
	if (!m) return null;
	const idx = [
		'jan',
		'feb',
		'mar',
		'apr',
		'may',
		'jun',
		'jul',
		'aug',
		'sep',
		'oct',
		'nov',
		'dec'
	].indexOf(m[1].slice(0, 3).toLowerCase());
	return idx < 0 ? null : `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
}

interface MonthRow {
	date: string;
	month: string;
	open: boolean;
	cash: number;
	etf: number;
	etfMoves: number;
	super: number;
	liab: number;
	home: number;
	mortgage: number;
	extras: number[];
}

interface Liability {
	name: string;
	kind: 'share' | 'amortised' | 'manual';
	current: number;
	rateBp: number;
	repayment: number;
	start: number;
	startDate: string | null;
	finalDate: string | null;
	shareBp: number;
}

/** What run() worked out, kept for validate(). */
let lastRun: {
	months: string[];
	sheetNetWorth: Map<string, number>;
} | null = null;

function readHistory(ctx: SheetContext) {
	const sh = ctx.wb.sheet('History');
	const hdr = need(find(sh, is('Month'), 5), 'the History tab’s Month column');
	const col = (label: string, required = true) => {
		for (let c = 1; c <= sh.maxCol; c++)
			if (text(sh.at(hdr.row, c)).toLowerCase() === label.toLowerCase()) return c;
		if (required) throw new Error(`The History tab has no “${label}” column`);
		return null;
	};
	const c = {
		etf: col('ETF Value')!,
		etfMoves: col('ETF Movements')!,
		cash: col('Cash Value')!,
		super: col('Super Value')!,
		liab: col('Liabilities Balance')!,
		home: col('Current Property ($)')!,
		mortgage: col('Mortgage Balance')!
	};
	const extraCols = ['Stocks Value', 'Crypto Value', 'M. Fund Value', 'Other Assets Value']
		.map((l) => ({
			label: l.replace(/ Value$/, '').replace(/^M\. Fund$/, 'Managed funds'),
			col: col(l, false)
		}))
		.filter((e): e is { label: string; col: number } => e.col != null);

	const today = localDate(ctx.now);
	const rows: MonthRow[] = [];
	for (let r = hdr.row + 1; r <= sh.maxRow; r++) {
		const d = sh.at(r, hdr.col);
		if (typeof d !== 'number') break;
		const date = serialToDate(d);
		rows.push({
			date,
			month: date.slice(0, 7),
			open: date > today || date.slice(0, 7) >= today.slice(0, 7),
			cash: cents(sh.at(r, c.cash)),
			etf: cents(sh.at(r, c.etf)),
			etfMoves: cents(sh.at(r, c.etfMoves)),
			super: cents(sh.at(r, c.super)),
			liab: Math.abs(cents(sh.at(r, c.liab))),
			home: cents(sh.at(r, c.home)),
			mortgage: Math.abs(cents(sh.at(r, c.mortgage))),
			extras: extraCols.map((e) => cents(sh.at(r, e.col)))
		});
	}
	if (!rows.length) throw new Error('The History tab has no months');
	return { rows, extraCols };
}

/** Net worth per month from the Net Worth tab's own table, and its notes. */
function readNetWorthTab(ctx: SheetContext) {
	const sh = ctx.wb.sheet('Net Worth');
	const nw = need(find(sh, is('Rolling NW'), 5), 'the Net Worth tab’s Rolling NW column');
	const dateCol = need(find(sh, is('Date'), 5), 'the Net Worth tab’s Date column').col;
	const notes = find(sh, starts('Notes'), 5);
	const netWorth = new Map<string, number>();
	const note = new Map<string, string>();
	for (let r = nw.row + 1; r <= sh.maxRow; r++) {
		const d = sh.at(r, dateCol);
		if (typeof d !== 'number') continue;
		const month = serialToDate(d).slice(0, 7);
		const v = num(sh.at(r, nw.col));
		if (v != null) netWorth.set(month, Math.round(v * 100));
		const n = notes ? text(sh.at(r, notes.col)) : '';
		// The sheet's template ships an example note in its first row.
		if (n && n !== '-' && !/^example:/i.test(n)) note.set(month, n);
	}
	return { netWorth, note };
}

/** Cumulative cost of ETFs bought, per month (the ETFs tab's compressed table). */
function readEtfCost(ctx: SheetContext) {
	const out = new Map<string, number>();
	if (!ctx.wb.has('ETFs')) return out;
	const sh = ctx.wb.sheet('ETFs');
	const h = find(sh, starts('Cumul.Contrib'), 10);
	if (!h) return out;
	for (let r = h.row + 1; r <= sh.maxRow; r++) {
		const month = monthOfCell(sh.at(r, h.col - 1));
		const v = num(sh.at(r, h.col));
		if (!month || v == null) continue;
		out.set(month, Math.round(v * 100));
	}
	return out;
}

/** Savers listed on the Cash tab with today's balances. */
function readSavers(ctx: SheetContext) {
	const sh = ctx.wb.sheet('Cash');
	const bal = find(sh, is('AUD Balance'), 3) ?? find(sh, is('Balance'), 3);
	if (!bal) return [];
	const out: { name: string; value: number }[] = [];
	for (let r = bal.row + 1; r <= sh.maxRow; r++) {
		const name = text(sh.at(r, 1));
		if (!name) break;
		// "Bank - Saver" → "Saver", so it matches the bank's own account name later.
		out.push({
			name: name.replace(/^[^-]+?\s+-\s+/, '').trim() || name,
			value: cents(sh.at(r, bal.col))
		});
	}
	return out;
}

/** The first property's details and its mortgage terms. */
function readProperty(ctx: SheetContext) {
	const sh = ctx.wb.sheet('Property');
	const top = find(sh, is('Property Breakdown')) ?? { row: 1, col: 3 };
	const rowOf = (label: string) => {
		for (let r = top.row; r <= sh.maxRow; r++) if (starts(label)(text(sh.at(r, top.col)))) return r;
		return null;
	};
	const v = (label: string) => {
		const r = rowOf(label);
		return r ? sh.at(r, top.col + 1) : null;
	};
	return {
		primary: /^y/i.test(text(v('Primary Residence'))),
		label: text(sh.at(rowOf('Update below') ?? top.row + 1, top.col + 1)) || 'Property',
		purchased: num(v('Date of Purchase')),
		rate: num(v('Annual Interest Rate')) ?? 0,
		repayment: num(v('Your Regular Payment')) ?? 0
	};
}

/** Loans on the LiabilitiesDebts tab, one per named column with a balance. */
function readLiabilities(ctx: SheetContext, homeNow: number): Liability[] {
	const sh = ctx.wb.sheet('LiabilitiesDebts');
	const names = need(find(sh, is('Name:')), 'the loan names on the LiabilitiesDebts tab');
	const rowOf = (label: string) => {
		for (let r = names.row; r <= sh.maxRow; r++)
			if (starts(label)(text(sh.at(r, names.col)))) return r;
		return null;
	};
	const rows = {
		start: rowOf('Loan Start Date'),
		rate: rowOf('Annual Interest Rate'),
		payment: rowOf('Your Regular Payment'),
		startBal: rowOf('Start Loan Balance'),
		current: need(rowOf('Current Loan Balance'), 'the current loan balances'),
		final: rowOf('Estimated Final Payment')
	};
	const out: Liability[] = [];
	// The loans sit in a block of named columns; the first empty name ends it.
	for (let c = names.col + 1; c <= sh.maxCol; c++) {
		const name = text(sh.at(names.row, c));
		if (!name || typeof sh.at(names.row, c) === 'number') break;
		if (name === '-') continue;
		const current = Math.abs(cents(sh.at(rows.current, c)));
		const start = rows.startBal ? Math.abs(cents(sh.at(rows.startBal, c))) : 0;
		if (!current && !start) continue;
		const rate = rows.rate ? (num(sh.at(rows.rate, c)) ?? 0) : 0;
		const repayment = rows.payment ? cents(sh.at(rows.payment, c)) : 0;
		const sd = rows.start ? sh.at(rows.start, c) : null;
		const fd = rows.final ? sh.at(rows.final, c) : null;
		// No rate, no repayment and a whole number of basis points of the home: a share of it.
		const ratio = homeNow > 0 ? (current / homeNow) * 10_000 : 0;
		const bp = Math.round(ratio);
		const isShare =
			!rate &&
			!repayment &&
			bp >= 100 &&
			bp <= 9_900 &&
			Math.abs(shareOf(homeNow, bp) - current) <= 1;
		out.push({
			name,
			kind: isShare ? 'share' : rate > 0 && repayment > 0 ? 'amortised' : 'manual',
			current,
			rateBp: Math.round(rate * 10_000 * 100) / 100,
			repayment,
			start,
			startDate: typeof sd === 'number' ? serialToDate(sd) : null,
			finalDate: typeof fd === 'number' ? serialToDate(fd) : null,
			shareBp: isShare ? bp : 0
		});
	}
	return out;
}

/**
 * The sheet keeps one liabilities total per month. Split it into the loans by walking back
 * from today's balances: a share account keeps its value unless another home value it
 * could have been based on explains the month far better; an amortised loan takes the
 * rest, unless that would mean it moved by more than its repayments allow, in which case
 * the other loan (stepped by hand in the sheet) moved instead.
 */
export function splitLiabilities(rows: MonthRow[], loans: Liability[]): number[][] {
	const n = rows.length;
	const vals: number[][] = new Array(n);
	vals[n - 1] = loans.map((l) => l.current);
	const sumCurrent = vals[n - 1].reduce((a, b) => a + b, 0);
	const shares = loans.map((l, i) => (l.kind === 'share' ? i : -1)).filter((i) => i >= 0);
	const amortised = loans.map((l, i) => (l.kind === 'amortised' ? i : -1)).filter((i) => i >= 0);
	const nonShare = loans.map((_, i) => i).filter((i) => !shares.includes(i));
	const biggest = (ids: number[], v: number[]) =>
		ids.reduce((b, i) => (b < 0 || v[i] > v[b] ? i : b), -1);
	const tol = Math.max(
		100,
		amortised.reduce((s, i) => s + loans[i].repayment, 0)
	);
	// Any gap between today's balances and the open month's total goes to the residual loan.
	const residual = amortised.length === 1 ? amortised[0] : biggest(nonShare, vals[n - 1]);
	if (residual >= 0 && sumCurrent !== rows[n - 1].liab)
		vals[n - 1][residual] += rows[n - 1].liab - sumCurrent;

	for (let m = n - 2; m >= 0; m--) {
		const next = vals[m + 1];
		const v = [...next];
		const total = rows[m].liab;
		for (const s of shares) {
			const others = v.reduce((a, x, i) => (i === s ? a : a + x), 0);
			const J = (x: number) => Math.abs(total - x - others);
			let best = next[s];
			const homes = new Set(rows.slice(0, m + 1).map((r) => r.home));
			for (const h of homes) {
				const x = shareOf(h, loans[s].shareBp);
				if (J(x) + tol < J(best)) best = x;
			}
			v[s] = best;
		}
		const rest = total - shares.reduce((a, s) => a + v[s], 0);
		if (residual >= 0) {
			const others = nonShare.filter((i) => i !== residual);
			v[residual] = rest - others.reduce((a, i) => a + v[i], 0);
			const loan = loans[residual];
			if (loan.kind === 'amortised' && others.length) {
				const gap = Math.max(1, monthsBetween(rows[m].month, rows[m + 1].month));
				const dec = v[residual] - next[residual];
				if (dec < -loan.repayment || dec > gap * loan.repayment + loan.repayment) {
					const interest = Math.round((next[residual] * loan.rateBp) / 10_000 / 12);
					v[residual] = next[residual] + gap * Math.max(0, loan.repayment - interest);
					const step = biggest(others, next);
					v[step] =
						rest - v[residual] - others.filter((i) => i !== step).reduce((a, i) => a + v[i], 0);
				}
			}
		}
		vals[m] = v;
	}
	return vals;
}

function wipe() {
	const sheetMonths = db
		.select({ month: schema.snapshots.month })
		.from(schema.snapshots)
		.where(eq(schema.snapshots.origin, 'sheet'))
		.all()
		.map((s) => s.month);
	if (sheetMonths.length)
		db.delete(schema.edits)
			.where(and(eq(schema.edits.entity, 'snapshot'), inArray(schema.edits.entityKey, sheetMonths)))
			.run();
	db.delete(schema.snapshots).where(eq(schema.snapshots.origin, 'sheet')).run();
	db.delete(schema.balances).where(eq(schema.balances.source, 'sheet')).run();
	db.delete(schema.accounts).where(eq(schema.accounts.origin, 'sheet')).run();
	lastRun = null;
}

function run(ctx: SheetContext) {
	const appLocked = db
		.select({ month: schema.snapshots.month })
		.from(schema.snapshots)
		.where(and(eq(schema.snapshots.origin, 'app'), eq(schema.snapshots.status, 'locked')))
		.all();
	if (appLocked.length)
		throw new Error(
			`${appLocked.map((s) => monthName(s.month)).join(', ')} ${appLocked.length === 1 ? 'was' : 'were'} closed in the app, and a re-import would remove the accounts ${appLocked.length === 1 ? 'it uses' : 'they use'}`
		);
	const { rows, extraCols } = readHistory(ctx);
	const nwTab = readNetWorthTab(ctx);
	const etfCost = readEtfCost(ctx);
	const savers = readSavers(ctx);
	const property = readProperty(ctx);
	const openRow = rows[rows.length - 1].open ? rows[rows.length - 1] : null;
	const locked = rows.filter((r) => !r.open);
	if (!locked.length) throw new Error('The History tab has no finished months');
	const current = openRow ?? locked[locked.length - 1];
	const loans = readLiabilities(ctx, current.home);
	const lastLockedRow = locked[locked.length - 1];
	const importDay = localDate(ctx.now);
	const now = new Date();

	let order = 0;
	const make = (v: Omit<NewAccount, 'origin' | 'sortOrder'>) => {
		order += 10;
		const a = findOrCreateAccount({ ...v, origin: 'sheet', sortOrder: order });
		return a;
	};
	const balance = (
		accountId: number,
		date: string,
		valueCents: number,
		reestimate = false,
		note?: string
	) =>
		db
			.insert(schema.balances)
			.values({ accountId, date, valueCents, source: 'sheet', reestimate, note, createdAt: now })
			.run();

	// Accounts, in the order Home lists them.
	const saverAccounts = savers.map((s, i) =>
		make({
			name: s.name,
			kind: 'cash',
			side: 'asset',
			source: 'manual',
			investable: true,
			closeOrder: 10 + i
		})
	);
	const firstOpenDay = addDays(monthEnd(lastLockedRow.month), 1);
	const cashHistory = make({
		name: saverAccounts.length ? 'Cash (sheet history)' : 'Cash',
		kind: 'cash',
		side: 'asset',
		source: 'manual',
		investable: true,
		closedOn: saverAccounts.length ? firstOpenDay : null,
		closeOrder: saverAccounts.length ? null : 10,
		note: saverAccounts.length
			? `The sheet kept one cash total a month. From ${monthName(firstOpenDay.slice(0, 7))} each saver has its own account.`
			: null
	});
	const etf = make({
		name: 'ETFs',
		kind: 'investment',
		side: 'asset',
		source: 'betashares',
		investable: true,
		closeOrder: 30
	});
	const superAcc = make({
		name: 'Super',
		kind: 'super',
		side: 'asset',
		source: 'manual',
		closeOrder: 50,
		updateEveryDays: 35
	});
	const home = make({
		name: property.primary ? 'Home' : property.label,
		kind: 'property',
		side: 'asset',
		source: 'manual',
		closeOrder: 90,
		openedOn: property.purchased ? serialToDate(property.purchased) : null
	});
	const mortgage = make({
		name: 'Mortgage',
		kind: 'loan',
		side: 'liability',
		source: 'manual',
		closeOrder: 60,
		updateEveryDays: 35
	});
	if (property.rate > 0 && property.repayment > 0) {
		db.insert(schema.calculations)
			.values({
				accountId: mortgage.id,
				kind: 'loan_terms',
				params: {
					annualRateBp: Math.round(property.rate * 1_000_000) / 100,
					repaymentCents: Math.round(property.repayment * 100),
					paymentDay: null
				},
				updatedAt: now
			})
			.onConflictDoNothing()
			.run();
	}
	const loanAccounts = loans.map((l, i) => {
		const a = make({
			name: l.name,
			kind: 'loan',
			side: 'liability',
			source: l.kind === 'manual' ? 'manual' : 'calculated',
			closeOrder: l.kind === 'amortised' ? 40 + i : l.kind === 'share' ? 95 + i : 70 + i,
			openedOn: l.startDate
		});
		let params: unknown = null;
		if (l.kind === 'share') params = { accountId: home.id, shareBp: l.shareBp };
		if (l.kind === 'amortised' && l.startDate) {
			const first = addDays(l.startDate, 0).slice(0, 7);
			const firstPayment = `${first}-${l.startDate.slice(8, 10)}`;
			const firstPaymentDate =
				monthEnd(first) >= firstPayment ? addMonthKeepDay(l.startDate) : firstPayment;
			const payments =
				l.finalDate != null
					? monthsBetween(firstPaymentDate.slice(0, 7), l.finalDate.slice(0, 7)) + 1
					: null;
			params = {
				principalCents: l.start,
				annualRateBp: l.rateBp,
				repaymentCents: l.repayment,
				firstPaymentDate,
				payments
			};
		}
		if (params)
			db.insert(schema.calculations)
				.values({
					accountId: a.id,
					kind: l.kind === 'share' ? 'share_of' : 'amortised',
					params,
					updatedAt: now
				})
				.onConflictDoNothing()
				.run();
		return a;
	});
	const extraAccounts = extraCols.map((e, i) =>
		rows.some((r) => r.extras[i] !== 0)
			? make({ name: e.label, kind: 'other', side: 'asset', source: 'manual', closeOrder: 80 + i })
			: null
	);

	// Liabilities history, split from the sheet's monthly total.
	const split = splitLiabilities(rows, loans);

	// Balances and snapshots, month by month.
	let prev: MonthRow | null = null;
	let prevValues: Map<number, number> | null = null;
	for (let m = 0; m < rows.length; m++) {
		const r = rows[m];
		const values = new Map<number, number>();
		if (r.open) break;
		values.set(cashHistory.id, r.cash);
		values.set(etf.id, r.etf);
		values.set(superAcc.id, r.super);
		values.set(home.id, r.home);
		values.set(mortgage.id, r.mortgage);
		loanAccounts.forEach((a, i) => values.set(a.id, split[m][i]));
		extraAccounts.forEach((a, i) => a && values.set(a.id, r.extras[i]));

		for (const [id, v] of values) {
			const isCalc = loans[loanAccounts.findIndex((a) => a.id === id)]?.kind;
			if (isCalc === 'share' || isCalc === 'amortised') continue;
			if (prevValues && prevValues.get(id) === v && id !== home.id) continue;
			balance(id, r.date, v, id === home.id && !!prevValues && prevValues.get(id) !== v);
		}

		let breakdown: Breakdown | null = null;
		if (prev && prevValues) {
			const a = etfCost.get(prev.month);
			const b = etfCost.get(r.month);
			const bought = a != null && b != null ? b - a : r.etfMoves;
			breakdown = breakdownBetween({
				prevMonth: prev.month,
				prev: prevValues,
				curr: values,
				bought,
				boughtSource: 'sheet',
				from: prev.date,
				to: r.date
			});
		}
		let net = 0;
		for (const a of allAccounts()) {
			const v = values.get(a.id);
			if (v != null) net += a.side === 'liability' ? -v : v;
		}
		db.insert(schema.snapshots)
			.values({
				month: r.month,
				status: 'locked',
				netWorthCents: net,
				breakdown,
				note: nwTab.note.get(r.month) ?? null,
				origin: 'sheet',
				lockedAt: now,
				createdAt: now,
				updatedAt: now
			})
			.run();
		db.insert(schema.snapshotValues)
			.values(
				[...values].map(([accountId, valueCents]) => ({ month: r.month, accountId, valueCents }))
			)
			.run();
		prev = r;
		prevValues = values;
	}

	// Today's balances: the savers, and anything that moved since the last locked month.
	const last = prevValues!;
	savers.forEach((s, i) => balance(saverAccounts[i].id, importDay, s.value));
	const nowValues: [number, number, boolean][] = [
		[etf.id, current.etf, false],
		[superAcc.id, current.super, false],
		[home.id, current.home, true],
		[mortgage.id, current.mortgage, false]
	];
	loans.forEach((l, i) => {
		if (l.kind === 'manual') nowValues.push([loanAccounts[i].id, split[rows.length - 1][i], false]);
	});
	for (const [id, v, re] of nowValues) if (last.get(id) !== v) balance(id, importDay, v, re);
	// An amortised loan restarts its schedule from the sheet's latest balance.
	loans.forEach((l, i) => {
		if (l.kind !== 'amortised') return;
		const v = split[rows.length - 1][i];
		const same = last.get(loanAccounts[i].id) === v;
		balance(
			loanAccounts[i].id,
			same ? lastLockedRow.date : importDay,
			v,
			false,
			'Latest balance in the sheet'
		);
	});

	if (openRow) refreshOpenMonth(openRow.month, 'sheet');

	const kinds = loans.map(
		(l) =>
			`${l.name} (${l.kind === 'share' ? `${l.shareBp / 100}% of the home` : l.kind === 'amortised' ? 'calculated loan' : 'entered by hand'})`
	);
	ctx.report(
		'ok',
		`Loaded ${locked.length} months, ${monthName(locked[0].month)} to ${monthName(lastLockedRow.month)}${openRow ? `, with ${monthName(openRow.month)} open` : ''}.`
	);
	ctx.report(
		'ok',
		`Accounts: ${savers.length} savers, ETFs, super, the home, the mortgage${kinds.length ? `, ${kinds.join(', ')}` : ''}.`
	);
	if (savers.length)
		ctx.report(
			'ok',
			`The sheet only keeps a cash total per month, so finished months use “${cashHistory.name}”; the ${savers.length} savers start from today’s balances.`
		);
	if (loans.length > 1)
		ctx.report(
			'ok',
			'The sheet keeps one liabilities total per month; it was split into each loan, with the remainder on the loan entered by hand.'
		);
	for (const [i, l] of loans.entries()) {
		if (l.kind !== 'amortised') continue;
		ctx.report(
			'warn',
			`${l.name}: worked out from the sheet’s rough terms (${formatMoney(l.start)} at ${l.rateBp / 100}%, ${formatMoney(l.repayment, { cents: true })} a month), restarting from its latest balance. Put the contract’s exact terms in Manage › Accounts.`
		);
		void i;
	}
	lastRun = { months: locked.map((r) => r.month), sheetNetWorth: nwTab.netWorth };
}

/** Same day next month: a loan's first repayment is a month after it starts. */
function addMonthKeepDay(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	const month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
	const end = Number(monthEnd(month).slice(8));
	return `${month}-${String(Math.min(d, end)).padStart(2, '0')}`;
}

function validate(ctx: SheetContext) {
	if (!lastRun) return;
	const fmt = (c: number) => formatMoney(c, { sign: true });
	let bad = 0;
	for (const month of lastRun.months) {
		const snap = db.select().from(schema.snapshots).where(eq(schema.snapshots.month, month)).get();
		const sheet = lastRun.sheetNetWorth.get(month);
		if (!snap || snap.netWorthCents == null) {
			ctx.report('fail', `${monthName(month)}: no snapshot was made.`);
			bad++;
			continue;
		}
		const b = snap.breakdown as Breakdown | null;
		const parts = b
			? ` · ${fmt(b.total)}: ${partRows(b)
					.map(
						(p) =>
							`${/^[A-Z]{2}/.test(p.label) ? p.label : p.label[0].toLowerCase() + p.label.slice(1)} ${fmt(p.cents)}`
					)
					.join(', ')}, estimates ${fmt(b.estimates)}`
			: ' · first month on record';
		if (sheet == null) {
			ctx.report(
				'warn',
				`${monthName(month)}: ${formatMoney(snap.netWorthCents)}; the sheet has no net worth to compare${parts}`
			);
			continue;
		}
		const diff = snap.netWorthCents - sheet;
		if (Math.abs(diff) <= 100) {
			ctx.report(
				'ok',
				`${monthName(month)}: ${formatMoney(snap.netWorthCents)} matches the sheet${parts}`
			);
		} else {
			bad++;
			ctx.report(
				'fail',
				`${monthName(month)}: ${formatMoney(snap.netWorthCents)} but the sheet says ${formatMoney(sheet)} (${fmt(diff)})${parts}`
			);
		}
		// Parts must add up to the change, every month.
		if (b) {
			const sum = b.cash + b.bought + b.markets + b.super + b.debt + b.estimates + b.other;
			if (sum !== b.total) ctx.report('fail', `${monthName(month)}: the breakdown doesn’t add up.`);
		}
	}
	const values = lastRun.months.length
		? snapshotValues(lastRun.months[lastRun.months.length - 1])
		: null;
	if (values)
		ctx.report(
			bad ? 'warn' : 'ok',
			bad
				? `${bad} month${bad === 1 ? '' : 's'} don’t match the sheet.`
				: `All ${lastRun.months.length} months match the sheet within $1.`
		);
}

/**
 * Bought ETFs: the sheet's cost table records buys in a different month from the trade
 * date, so once the trades are loaded (after this area has run) every month they cover
 * is worked out from them. Only months before the first trade keep the sheet's figure.
 */
function finish(ctx: SheetContext) {
	if (!lastRun) return;
	const first = firstTradeDate();
	const changed = boughtFromTrades();
	const fromSheet = lastRun.months.filter((month) => {
		const b = db.select().from(schema.snapshots).where(eq(schema.snapshots.month, month)).get()
			?.breakdown as Breakdown | null;
		return b?.boughtSource === 'sheet';
	}).length;
	if (!first) {
		ctx.report(
			'ok',
			'No trades are loaded, so Bought ETFs comes from the sheet’s ETF cost table (or the History tab’s ETF movements); it follows trade dates once trades are loaded.'
		);
		return;
	}
	const fromTrades = lastRun.months.length - 1 - fromSheet;
	ctx.report(
		'ok',
		`Bought ETFs for ${fromTrades} month${fromTrades === 1 ? '' : 's'} comes from trade dates${changed.length ? `, which moved ${changed.length} of them from the sheet’s month` : ''}.`
	);
	if (fromSheet)
		ctx.report(
			'ok',
			`Bought ETFs for ${fromSheet} month${fromSheet === 1 ? '' : 's'} before the first trade comes from the sheet’s ETF cost table (or the History tab’s ETF movements).`
		);
}

export const historyArea: SheetArea = {
	id: 'history',
	label: 'History',
	wipe,
	run,
	finish,
	validate
};
