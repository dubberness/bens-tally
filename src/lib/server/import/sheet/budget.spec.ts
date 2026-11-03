import { beforeEach, describe, expect, it } from 'vitest';
import { db, schema } from '../../db';
import { findOrCreateAccount } from '../../accounts';
import { planFor } from '../../budget/lines';
import { budgetSetting, BUDGET_SETTINGS } from '../../budget/settings';
import { makeTx, resetBudget } from '../../budget/testing';
import type { Cell, Sheet, Workbook } from '../xlsx';
import { budgetArea } from './budget';
import type { ReportLine } from './types';

/** A tab laid out like the sheet's Budget tab, with made-up names and numbers. */
function sheetOf(cells: Record<string, Cell>): Sheet {
	const key = (r: number, c: number) => `${r},${c}`;
	const map = new Map<string, Cell>();
	let maxRow = 0;
	let maxCol = 0;
	for (const [ref, v] of Object.entries(cells)) {
		const m = ref.match(/^([A-Z])(\d+)$/)!;
		const c = m[1].charCodeAt(0) - 64;
		const r = Number(m[2]);
		map.set(key(r, c), v);
		maxRow = Math.max(maxRow, r);
		maxCol = Math.max(maxCol, c);
	}
	return {
		name: 'Budget',
		cell: () => null,
		at: (r, c) => map.get(key(r, c)) ?? null,
		maxRow,
		maxCol,
		rows: () => []
	};
}

const tab = sheetOf({
	A2: 'Monthly Income: ',
	C2: 'Job Start Date:',
	D2: 46000, // 2025-12-12
	A3: 'Salary Frequency: ',
	B3: 'Weekly',
	A4: 'Net Regular Income:',
	B4: 1000,
	A7: 'ITEM',
	C7: 'Monthly $',
	F7: 'Bank Account',
	G7: 'Category',
	A8: 'Acme Telco',
	C8: 90,
	F8: 'Up - Bills',
	G8: 'Expenses',
	A9: 'Groceries',
	C9: 500,
	F9: 'Up - Daily',
	G9: 'Expenses',
	A10: 'Treats',
	C10: 100,
	F10: 'Up - Daily',
	G10: 'Fun',
	A11: 'Holiday pot',
	C11: 200,
	F11: 'Up - Bills',
	G11: 'Holiday',
	A12: 'Mystery',
	C12: 10,
	G12: 'Zzz',
	A13: 'Yearly Expenses - Automatic',
	C13: 300,
	F13: 'Up - Bills',
	G13: 'Expenses',
	A15: 'Automatic Salary Bank Transfers (Weekly)',
	E15: 'Yearly Expenses',
	A17: 'Bank Name',
	B17: 'Amount',
	E17: 'Rego',
	F17: 600,
	A18: 'Up - Bills',
	B18: 400.5,
	E18: 'Rates',
	F18: 1200,
	A19: 'Up - Daily',
	B19: 250
});

const wb: Workbook = { names: ['Budget'], has: (n) => n === 'Budget', sheet: () => tab };

function load() {
	const lines: ReportLine[] = [];
	budgetArea.run({
		wb,
		now: new Date('2026-11-03T10:00:00+11:00'),
		report: (level, message) => lines.push({ level, area: 'budget', message })
	});
	return lines;
}

describe('Budget tab import', () => {
	beforeEach(() => {
		resetBudget();
		db.delete(schema.accounts).run();
		findOrCreateAccount({ name: 'Bills', kind: 'cash', side: 'asset', source: 'manual' });
	});

	it('loads lines, plan amounts, the pay split and yearly bills as the tab has them', () => {
		const report = load();
		expect(report.every((l) => l.level !== 'fail')).toBe(true);
		const lines = db.select().from(schema.budgetLines).all();
		expect(lines.map((l) => l.name)).toEqual([
			'Acme Telco',
			'Groceries',
			'Treats',
			'Holiday pot',
			'Mystery',
			'Yearly Expenses - Automatic'
		]);
		expect(lines.map((l) => l.group)).toEqual([
			'bills',
			'bills',
			'fun',
			'savings',
			'living',
			'bills'
		]);
		const telco = lines[0];
		expect(planFor(telco.id, '2025-12')).toBe(9000);
		expect(planFor(telco.id, '2025-11')).toBe(0); // the plan counts from the job start month

		// "Up - Bills" met the account that was already there; "Up - Daily" is new.
		const accounts = db.select().from(schema.accounts).all();
		expect(accounts.map((a) => a.name).sort()).toEqual(['Bills', 'Daily']);
		expect(telco.saverAccountId).toBe(accounts.find((a) => a.name === 'Bills')!.id);

		const split = db.select().from(schema.paySplits).all();
		expect(split.map((s) => s.amountCents)).toEqual([40050, 25000]);

		const bills = db.select().from(schema.yearlyBills).all();
		expect(bills.map((b) => [b.name, b.yearlyCents])).toEqual([
			['Rego', 60000],
			['Rates', 120000]
		]);
		expect(bills.every((b) => b.budgetLineId === lines[5].id)).toBe(true);

		expect(budgetSetting(BUDGET_SETTINGS.payFrequency)).toBe('week');
		expect(budgetSetting(BUDGET_SETTINGS.planPay)).toBe(100000);
		expect(report.some((l) => l.level === 'warn' && l.message.includes('Zzz'))).toBe(true);
	});

	it('makes starter rules only for names that match a transaction', () => {
		makeTx('Acme Telco', -9000, '2026-10-27');
		makeTx('Corner Store', -1000, '2026-10-27');
		load();
		const rules = db.select().from(schema.rules).all();
		expect(rules.map((r) => r.match)).toEqual([{ merchant: 'Acme Telco' }]);
		expect(rules[0].origin).toBe('sheet');
		const a = db.select().from(schema.assignments).all();
		expect(a).toHaveLength(1);
	});

	it('wipes what it made and nothing else, so it can run again', () => {
		load();
		db.insert(schema.budgetLines)
			.values({ name: 'Added by hand', group: 'fun', createdAt: new Date(), updatedAt: new Date() })
			.run();
		budgetArea.wipe();
		expect(
			db
				.select()
				.from(schema.budgetLines)
				.all()
				.map((l) => l.name)
		).toEqual(['Added by hand']);
		expect(db.select().from(schema.paySplits).all()).toHaveLength(0);
		expect(db.select().from(schema.yearlyBills).all()).toHaveLength(0);
		load();
		expect(db.select().from(schema.budgetLines).all()).toHaveLength(7);
	});
});
