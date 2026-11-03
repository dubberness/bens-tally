import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { formatMoney } from '$lib/money';
import { db, schema } from '../../db';
import { findOrCreateAccount } from '../../accounts';
import { plainName } from '../../up/sync';
import { applyRules } from '../../budget/engine';
import { suggestLineRules } from '../../budget/starter';
import { setAmount } from '../../budget/lines';
import { BUDGET_SETTINGS, setBudgetSetting, type PayFrequency } from '../../budget/settings';
import { serialToDate, type Sheet } from '../xlsx';
import { cents, find, is, num, starts, text } from './cells';
import type { SheetArea, SheetContext } from './types';

/*
 * The Budget tab: its lines (name, monthly amount, the Up saver it is paid from,
 * category), the weekly pay split and the yearly expenses table. Everything is
 * found by the labels in the tab, nothing by position, and kept as the sheet has it
 * (stale names included) so the checks can point them out.
 */

/** The template's category names → the app's groups. Unknown ones are reported. */
const GROUPS: Record<string, string> = {
	expenses: 'bills',
	fun: 'fun',
	savings: 'savings',
	holiday: 'savings',
	investing: 'investing'
};

const FREQUENCIES: Record<string, PayFrequency> = {
	weekly: 'week',
	'2-weeks': 'fortnight',
	fortnightly: 'fortnight',
	'twice monthly': 'fortnight',
	'4-weeks': 'month',
	monthly: 'month'
};

/** "Up - Essentials" → "Essentials": the sheet prefixes the bank to its savers' names. */
const bareName = (s: string) => s.replace(/^\s*up\s*[-–:]\s*/i, '').trim();

/** The account a saver name points at: same name ignoring emoji and the bank prefix, else a new one. */
function saverAccount(raw: string) {
	const name = bareName(raw) || raw.trim();
	const want = plainName(name);
	const open = db
		.select()
		.from(schema.accounts)
		.where(and(eq(schema.accounts.kind, 'cash'), isNull(schema.accounts.closedOn)))
		.orderBy(asc(schema.accounts.id))
		.all();
	return (
		open.find((a) => plainName(a.name) === want) ??
		findOrCreateAccount({ name, kind: 'cash', side: 'asset', source: 'manual' })
	);
}

interface SheetLine {
	name: string;
	monthlyCents: number;
	saver: string;
	category: string;
}

function readLines(sheet: Sheet): { lines: SheetLine[]; head: { row: number; col: number } } {
	const head = find(sheet, is('ITEM'), 15);
	if (!head) throw new Error("Couldn't find the Budget tab's ITEM header");
	const cols: Record<string, number> = {};
	for (let c = 1; c <= sheet.maxCol; c++) {
		const v = text(sheet.at(head.row, c)).toLowerCase();
		if (v.startsWith('monthly')) cols.monthly ??= c;
		if (v.startsWith('bank')) cols.saver ??= c;
		if (v.startsWith('category')) cols.category ??= c;
	}
	if (!cols.monthly) throw new Error("Couldn't find the Budget tab's monthly amounts");
	const end = find(sheet, starts('Automatic Salary'), sheet.maxRow)?.row ?? sheet.maxRow + 1;
	const lines: SheetLine[] = [];
	let category = '';
	for (let r = head.row + 1; r < end; r++) {
		const name = text(sheet.at(r, head.col));
		const cat = cols.category ? text(sheet.at(r, cols.category)) : '';
		if (cat) category = cat;
		if (!name) continue;
		lines.push({
			name,
			monthlyCents: cents(sheet.at(r, cols.monthly)),
			saver: cols.saver ? text(sheet.at(r, cols.saver)) : '',
			category: cat || category
		});
	}
	return { lines, head };
}

function readPaySplit(sheet: Sheet): { saver: string; cents: number }[] {
	const head = find(sheet, is('Bank Name'));
	if (!head) return [];
	const out: { saver: string; cents: number }[] = [];
	for (let r = head.row + 1; r <= sheet.maxRow; r++) {
		const name = text(sheet.at(r, head.col));
		if (!name) break;
		out.push({ saver: name, cents: cents(sheet.at(r, head.col + 1)) });
	}
	return out;
}

function readYearly(sheet: Sheet): { name: string; yearlyCents: number }[] {
	const head = find(sheet, is('Yearly Expenses'));
	if (!head) return [];
	const out: { name: string; yearlyCents: number }[] = [];
	for (let r = head.row + 1; r <= sheet.maxRow; r++) {
		const name = text(sheet.at(r, head.col));
		if (!name) continue;
		const cost = num(sheet.at(r, head.col + 1));
		if (cost == null) continue;
		out.push({ name, yearlyCents: Math.round(cost * 100) });
	}
	return out;
}

/** The value next to a label ("Job Start Date:" → its date), or null. */
function beside(sheet: Sheet, label: string) {
	const at = find(sheet, starts(label), 12);
	return at ? sheet.at(at.row, at.col + 1) : null;
}

function wipe() {
	const ids = db
		.select({ id: schema.budgetLines.id })
		.from(schema.budgetLines)
		.where(eq(schema.budgetLines.origin, 'sheet'))
		.all()
		.map((l) => l.id);
	db.delete(schema.rules).where(eq(schema.rules.origin, 'sheet')).run();
	if (ids.length) {
		// A rule or hand choice for a line that is about to go would point nowhere.
		db.delete(schema.rules)
			.where(and(eq(schema.rules.action, 'budget'), inArray(schema.rules.budgetLineId, ids)))
			.run();
		db.delete(schema.assignments)
			.where(
				and(
					eq(schema.assignments.byHand, true),
					eq(schema.assignments.action, 'budget'),
					inArray(schema.assignments.budgetLineId, ids)
				)
			)
			.run();
	}
	db.delete(schema.yearlyBills).where(eq(schema.yearlyBills.origin, 'sheet')).run();
	db.delete(schema.paySplits).where(eq(schema.paySplits.origin, 'sheet')).run();
	db.delete(schema.budgetLines).where(eq(schema.budgetLines.origin, 'sheet')).run();
}

function run(ctx: SheetContext) {
	if (!ctx.wb.has('Budget')) {
		ctx.report('warn', 'No Budget tab, so no budget lines were loaded.');
		return;
	}
	const sheet = ctx.wb.sheet('Budget');
	const { lines } = readLines(sheet);
	const now = ctx.now;

	// The sheet's plan counts from the job start month; without one, from the import month.
	const start = beside(sheet, 'Job Start Date');
	const fromMonth =
		typeof start === 'number' ? serialToDate(start).slice(0, 7) : now.toISOString().slice(0, 7);

	const frequencyText = text(beside(sheet, 'Salary Frequency')).toLowerCase();
	const frequency = FREQUENCIES[frequencyText];
	if (frequency) setBudgetSetting(BUDGET_SETTINGS.payFrequency, frequency);
	const planPay = num(beside(sheet, 'Net Regular Income'));
	if (planPay != null) setBudgetSetting(BUDGET_SETTINGS.planPay, Math.round(planPay * 100));

	const unknown = new Set<string>();
	const made: { id: number; name: string }[] = [];
	lines.forEach((l, i) => {
		const group = GROUPS[l.category.toLowerCase()];
		if (!group && l.category) unknown.add(l.category);
		const saver = l.saver ? saverAccount(l.saver) : null;
		const row = db
			.insert(schema.budgetLines)
			.values({
				name: l.name,
				group: group ?? 'living',
				saverAccountId: saver?.id ?? null,
				sortOrder: (i + 1) * 10,
				origin: 'sheet',
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		setAmount(row.id, fromMonth, l.monthlyCents, 'month');
		made.push(row);
	});
	if (unknown.size)
		ctx.report(
			'warn',
			`Budget categories the app doesn’t group yet (their lines went under Living): ${[...unknown].join(', ')}.`
		);

	const split = readPaySplit(sheet);
	split.forEach((p, i) => {
		db.insert(schema.paySplits)
			.values({
				accountId: saverAccount(p.saver).id,
				amountCents: p.cents,
				sortOrder: (i + 1) * 10,
				origin: 'sheet',
				updatedAt: now
			})
			.run();
	});

	const yearly = readYearly(sheet);
	const fundLine = made.find((l) => /^yearly expenses/i.test(l.name));
	for (const b of yearly)
		db.insert(schema.yearlyBills)
			.values({
				name: b.name,
				yearlyCents: b.yearlyCents,
				months: [],
				budgetLineId: fundLine?.id ?? null,
				origin: 'sheet',
				createdAt: now,
				updatedAt: now
			})
			.run();

	// Lines named after what they are paid to (a shop, a provider) get a starter rule.
	const starter = suggestLineRules('sheet');
	applyRules();

	const total = lines.reduce((s, l) => s + l.monthlyCents, 0);
	ctx.report(
		'ok',
		`Budget: ${lines.length} lines (${formatMoney(total)} a month in all), ${split.length} savers in the pay split, ${yearly.length} yearly bills.`
	);
	if (!fundLine && yearly.length)
		ctx.report('warn', 'No “Yearly Expenses” line was found for the yearly bills to draw from.');
	ctx.report(
		starter ? 'ok' : 'warn',
		starter
			? `${starter} starter rules made from line names that match Up transactions.`
			: 'No line name matches an Up transaction yet; add rules in Manage › Rules once Up has synced.'
	);
}

export const budgetArea: SheetArea = {
	id: 'budget',
	label: 'Budget',
	wipe,
	run
};
