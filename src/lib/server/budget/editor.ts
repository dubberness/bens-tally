import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema, sqlite } from '../db';
import { applyRules, createRule, loadRules, updateRule, type Rule } from './engine';
import { amountFor, setAmount, GROUPS, type Period } from './lines';
import { budgetMonth, payView } from './month';
import { budgetSetting, BUDGET_SETTINGS, setBudgetSetting } from './settings';
import { addMonths, localMonth } from '$lib/time';

export interface LineInput {
	name: string;
	group: string;
	saverAccountId: number | null;
	startMonth: string | null;
	endMonth: string | null;
	note: string | null;
}

export interface AmountInput {
	amountCents: number;
	period: Period;
	fromMonth: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const validMonth = (s: string) => MONTH.test(s);

export function checkLine(input: LineInput): string | null {
	if (!input.name.trim()) return 'Give the line a name';
	if (!(GROUPS as readonly string[]).includes(input.group)) return 'Pick a group';
	if (input.startMonth && !validMonth(input.startMonth))
		return 'Start month should look like 2026-07';
	if (input.endMonth && !validMonth(input.endMonth)) return 'End month should look like 2026-07';
	if (input.startMonth && input.endMonth && input.endMonth < input.startMonth)
		return 'The line ends before it starts';
	return null;
}

/** The rule that holds a line's merchant: the first budget rule for it that matches on a merchant. */
export function merchantRule(lineId: number): Rule | undefined {
	return loadRules().find(
		(r) => r.action === 'budget' && r.budgetLineId === lineId && !!r.match.merchant
	);
}

/** Sets what the line looks for in a transaction's merchant, on its merchant rule (made if missing). */
export function setLineMerchant(lineId: number, name: string, merchant: string) {
	const rule = merchantRule(lineId);
	const text = merchant.trim();
	if (rule) {
		if (!text) {
			// Nothing to look for any more: the rule goes (it matched on the merchant alone).
			if (Object.keys(rule.match).length === 1) {
				db.delete(schema.rules).where(eq(schema.rules.id, rule.id)).run();
				applyRules();
			}
			return;
		}
		if (rule.match.merchant === text) return;
		updateRule(rule.id, {
			name,
			enabled: rule.enabled,
			match: { ...rule.match, merchant: text },
			action: 'budget',
			budgetLineId: lineId,
			label: null
		});
		return;
	}
	if (!text) return;
	createRule(
		{
			name,
			enabled: true,
			match: { merchant: text },
			action: 'budget',
			budgetLineId: lineId,
			label: null
		},
		'last'
	);
}

export function createLine(input: LineInput, amount: AmountInput | null, merchant: string): number {
	return sqlite.transaction(() => {
		const last = db
			.select({ m: sql<number>`coalesce(max(${schema.budgetLines.sortOrder}), 0)` })
			.from(schema.budgetLines)
			.get();
		const now = new Date();
		const row = db
			.insert(schema.budgetLines)
			.values({
				name: input.name.trim(),
				group: input.group,
				saverAccountId: input.saverAccountId,
				startMonth: input.startMonth,
				endMonth: input.endMonth,
				note: input.note,
				sortOrder: (last?.m ?? 0) + 10,
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		if (amount) setAmount(row.id, amount.fromMonth, amount.amountCents, amount.period);
		setLineMerchant(row.id, row.name, merchant);
		return row.id;
	})();
}

export function updateLine(
	id: number,
	input: LineInput,
	amount: AmountInput | null,
	merchant: string
) {
	sqlite.transaction(() => {
		db.update(schema.budgetLines)
			.set({
				name: input.name.trim(),
				group: input.group,
				saverAccountId: input.saverAccountId,
				startMonth: input.startMonth,
				endMonth: input.endMonth,
				note: input.note,
				updatedAt: new Date()
			})
			.where(eq(schema.budgetLines.id, id))
			.run();
		if (amount) {
			// Only a real change makes a new history row; saving the same amount again does not.
			const cur = amountFor(id, amount.fromMonth);
			if (!cur || cur.amountCents !== amount.amountCents || cur.period !== amount.period)
				setAmount(id, amount.fromMonth, amount.amountCents, amount.period);
		}
		setLineMerchant(id, input.name.trim(), merchant);
	})();
}

export function deleteLine(id: number) {
	sqlite.transaction(() => {
		// Rules and hand choices for a line that is going would point nowhere.
		db.delete(schema.rules)
			.where(and(eq(schema.rules.action, 'budget'), eq(schema.rules.budgetLineId, id)))
			.run();
		db.delete(schema.assignments)
			.where(
				and(
					eq(schema.assignments.byHand, true),
					eq(schema.assignments.action, 'budget'),
					eq(schema.assignments.budgetLineId, id)
				)
			)
			.run();
		db.delete(schema.budgetLines).where(eq(schema.budgetLines.id, id)).run();
	})();
	applyRules();
}

export function moveLine(id: number, dir: -1 | 1) {
	const list = db
		.select({ id: schema.budgetLines.id })
		.from(schema.budgetLines)
		.orderBy(asc(schema.budgetLines.sortOrder), asc(schema.budgetLines.id))
		.all();
	const i = list.findIndex((l) => l.id === id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= list.length) return;
	[list[i], list[j]] = [list[j], list[i]];
	sqlite.transaction(() =>
		list.forEach((l, k) =>
			db
				.update(schema.budgetLines)
				.set({ sortOrder: (k + 1) * 10 })
				.where(eq(schema.budgetLines.id, l.id))
				.run()
		)
	)();
}

/* ---------- pay split ---------- */

export function saveSplit(
	id: number | null,
	accountId: number,
	amountCents: number,
	note: string | null
) {
	const now = new Date();
	if (id) {
		db.update(schema.paySplits)
			.set({ accountId, amountCents, note, updatedAt: now })
			.where(eq(schema.paySplits.id, id))
			.run();
		return;
	}
	const last = db
		.select({ m: sql<number>`coalesce(max(${schema.paySplits.sortOrder}), 0)` })
		.from(schema.paySplits)
		.get();
	db.insert(schema.paySplits)
		.values({ accountId, amountCents, note, sortOrder: (last?.m ?? 0) + 10, updatedAt: now })
		.run();
}

export const deleteSplit = (id: number) =>
	db.delete(schema.paySplits).where(eq(schema.paySplits.id, id)).run();

/**
 * "Update the plan": each saver in the split is set to what it really receives, and the
 * pay the plan was written for becomes the real pay. Savers with no real transfers stay.
 */
export function matchRealPay(): number {
	const pay = payView();
	let changed = 0;
	sqlite.transaction(() => {
		for (const s of pay.splits) {
			if (s.planCents == null || !s.realCents || s.realCents === s.planCents) continue;
			if (s.accountId === pay.regular?.accountId) continue; // the pay's own account gets no transfer
			db.update(schema.paySplits)
				.set({ amountCents: s.realCents, updatedAt: new Date() })
				.where(eq(schema.paySplits.accountId, s.accountId))
				.run();
			changed++;
		}
		if (pay.regular) setBudgetSetting(BUDGET_SETTINGS.planPay, pay.regular.regularCents);
	})();
	return changed;
}

/* ---------- yearly bills ---------- */

export function saveBill(
	id: number | null,
	v: {
		name: string;
		yearlyCents: number;
		months: number[];
		budgetLineId: number | null;
		note: string | null;
	}
) {
	const now = new Date();
	if (id) {
		db.update(schema.yearlyBills)
			.set({ ...v, updatedAt: now })
			.where(eq(schema.yearlyBills.id, id))
			.run();
		return;
	}
	db.insert(schema.yearlyBills)
		.values({ ...v, createdAt: now, updatedAt: now })
		.run();
}

export const deleteBill = (id: number) =>
	db.delete(schema.yearlyBills).where(eq(schema.yearlyBills.id, id)).run();

/* ---------- start from last month's actuals ---------- */

/**
 * Sets each living line's plan from what a month really cost, from `into` on. Lines
 * the yearly bills fund pays, saving lines and lines with nothing spent are left alone.
 */
export function planFromActuals(from: string, into = localMonth()): number {
	const view = budgetMonth(from, false);
	let n = 0;
	sqlite.transaction(() => {
		for (const l of view.lines) {
			if (l.actualCents <= 0) continue;
			const dollars = Math.round(l.actualCents / 100) * 100;
			const cur = amountFor(l.id, into);
			if (cur && cur.period === 'month' && cur.amountCents === dollars) continue;
			setAmount(l.id, into, dollars, 'month');
			n++;
		}
	})();
	return n;
}

export const previousMonth = (m = localMonth()) => addMonths(m, -1);

/* ---------- settings ---------- */

export function budgetSettingsView() {
	return {
		tolerance: budgetSetting<number>(BUDGET_SETTINGS.tolerance),
		merchantGapMonths: budgetSetting<number>(BUDGET_SETTINGS.merchantGapMonths),
		payFrequency: budgetSetting<string>(BUDGET_SETTINGS.payFrequency),
		planPay: budgetSetting<number | null>(BUDGET_SETTINGS.planPay),
		yearlyFundStart: budgetSetting<string | null>(BUDGET_SETTINGS.yearlyFundStart),
		yearlyFundOpening: budgetSetting<number>(BUDGET_SETTINGS.yearlyFundOpening),
		includeOneOffs: budgetSetting<boolean>(BUDGET_SETTINGS.includeOneOffs)
	};
}
