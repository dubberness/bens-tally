import { fail, redirect } from '@sveltejs/kit';
import { asc, isNull } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { parseMoney } from '$lib/money';
import { addMonths, localMonth } from '$lib/time';
import {
	amountHistory,
	allLines,
	amountFor,
	GROUPS,
	GROUP_LABELS,
	paySplits,
	yearlyBills,
	type Period
} from '$lib/server/budget/lines';
import {
	budgetSettingsView,
	checkLine,
	createLine,
	deleteBill,
	deleteLine,
	deleteSplit,
	matchRealPay,
	merchantRule,
	moveLine,
	planFromActuals,
	saveBill,
	saveSplit,
	updateLine,
	validMonth,
	type LineInput
} from '$lib/server/budget/editor';
import { payView } from '$lib/server/budget/month';
import { BUDGET_SETTINGS, setBudgetSetting } from '$lib/server/budget/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const now = localMonth();
	const pay = payView();
	const real = new Map(pay.splits.map((s) => [s.accountId, s.realCents]));
	return {
		now,
		lastMonth: addMonths(now, -1),
		groups: GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] })),
		accounts: db
			.select({ id: schema.accounts.id, name: schema.accounts.name })
			.from(schema.accounts)
			.where(isNull(schema.accounts.closedOn))
			.orderBy(asc(schema.accounts.sortOrder), asc(schema.accounts.name))
			.all(),
		lines: allLines().map((l) => {
			const cur = amountFor(l.id, now);
			return {
				id: l.id,
				name: l.name,
				group: l.group,
				saverAccountId: l.saverAccountId,
				startMonth: l.startMonth ?? '',
				endMonth: l.endMonth ?? '',
				note: l.note ?? '',
				amountCents: cur?.amountCents ?? 0,
				period: (cur?.period ?? 'month') as Period,
				since: cur?.fromMonth ?? null,
				merchant: merchantRule(l.id)?.match.merchant ?? '',
				history: amountHistory(l.id).map((a) => ({
					fromMonth: a.fromMonth,
					amountCents: a.amountCents,
					period: a.period
				}))
			};
		}),
		splits: paySplits().map((p) => ({
			id: p.id,
			accountId: p.accountId,
			amountCents: p.amountCents,
			note: p.note ?? '',
			realCents: real.get(p.accountId) ?? 0
		})),
		pay: pay.regular
			? {
					cents: pay.regular.regularCents,
					frequency: pay.regular.frequency,
					source: pay.regular.source
				}
			: null,
		splitTotal: pay.totalCents,
		bills: yearlyBills().map((b) => ({
			id: b.id,
			name: b.name,
			yearlyCents: b.yearlyCents,
			months: b.months,
			budgetLineId: b.budgetLineId,
			note: b.note ?? ''
		})),
		settings: budgetSettingsView()
	};
};

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function money(f: FormData, k: string): number | null | string {
	const raw = str(f, k);
	if (!raw) return null;
	const c = parseMoney(raw);
	return c == null ? 'Amounts should be plain dollars, like 50 or 12.50' : c;
}

function readLine(f: FormData) {
	const saver = Number(str(f, 'saver'));
	const input: LineInput = {
		name: str(f, 'name'),
		group: str(f, 'group'),
		saverAccountId: saver > 0 ? saver : null,
		startMonth: str(f, 'startMonth') || null,
		endMonth: str(f, 'endMonth') || null,
		note: str(f, 'note') || null
	};
	const err = checkLine(input);
	if (err) return err;
	const amount = money(f, 'amount');
	if (typeof amount === 'string') return amount;
	const period = str(f, 'period');
	const from = str(f, 'from') || localMonth();
	if (!validMonth(from)) return 'Pick the month the amount applies from';
	return {
		input,
		amount:
			amount == null
				? null
				: {
						amountCents: amount,
						period: (['week', 'month', 'year'].includes(period) ? period : 'month') as Period,
						fromMonth: from
					},
		merchant: str(f, 'merchant')
	};
}

const idOf = (f: FormData) => Number(str(f, 'id')) || null;

export const actions: Actions = {
	saveLine: async ({ request }) => {
		const f = await request.formData();
		const id = idOf(f);
		const v = readLine(f);
		if (typeof v === 'string') return fail(400, { section: `line:${id ?? 'new'}`, error: v });
		if (id) updateLine(id, v.input, v.amount, v.merchant);
		else createLine(v.input, v.amount, v.merchant);
		return { section: `line:${id ?? 'new'}`, saved: true };
	},
	deleteLine: async ({ request }) => {
		const id = idOf(await request.formData());
		if (id) deleteLine(id);
		return { section: 'lines', saved: true };
	},
	moveLine: async ({ request }) => {
		const f = await request.formData();
		const id = idOf(f);
		if (id) moveLine(id, f.get('dir') === 'up' ? -1 : 1);
		return { section: 'lines', saved: true };
	},
	fromActuals: async ({ request }) => {
		const f = await request.formData();
		const from = str(f, 'from');
		if (!validMonth(from)) return fail(400, { section: 'actuals', error: 'Pick a month' });
		return { section: 'actuals', saved: true, changed: planFromActuals(from) };
	},
	saveSplit: async ({ request }) => {
		const f = await request.formData();
		const id = idOf(f);
		const account = Number(str(f, 'account'));
		const amount = money(f, 'amount');
		const section = `split:${id ?? 'new'}`;
		if (!(account > 0)) return fail(400, { section, error: 'Pick the saver' });
		if (typeof amount === 'string') return fail(400, { section, error: amount });
		saveSplit(id, account, amount ?? 0, str(f, 'note') || null);
		return { section, saved: true };
	},
	deleteSplit: async ({ request }) => {
		const id = idOf(await request.formData());
		if (id) deleteSplit(id);
		return { section: 'pay', saved: true };
	},
	matchReal: async () => {
		matchRealPay();
		redirect(303, '/budget');
	},
	saveBill: async ({ request }) => {
		const f = await request.formData();
		const id = idOf(f);
		const section = `bill:${id ?? 'new'}`;
		const name = str(f, 'name');
		const cost = money(f, 'yearly');
		if (!name) return fail(400, { section, error: 'Give the bill a name' });
		if (typeof cost === 'string') return fail(400, { section, error: cost });
		if (cost == null) return fail(400, { section, error: 'What does it cost a year?' });
		const line = Number(str(f, 'line'));
		saveBill(id, {
			name,
			yearlyCents: cost,
			months: f
				.getAll('months')
				.map(Number)
				.filter((n) => n >= 1 && n <= 12)
				.sort((a, b) => a - b),
			budgetLineId: line > 0 ? line : null,
			note: str(f, 'note') || null
		});
		return { section, saved: true };
	},
	deleteBill: async ({ request }) => {
		const id = idOf(await request.formData());
		if (id) deleteBill(id);
		return { section: 'bills', saved: true };
	},
	saveSettings: async ({ request }) => {
		const f = await request.formData();
		const tol = money(f, 'tolerance');
		const open = money(f, 'opening');
		const plan = money(f, 'planPay');
		for (const x of [tol, open, plan])
			if (typeof x === 'string') return fail(400, { section: 'settings', error: x });
		const gap = Number(str(f, 'gap'));
		if (!(gap >= 1 && gap <= 12))
			return fail(400, { section: 'settings', error: 'Months missing should be between 1 and 12' });
		const start = str(f, 'fundStart');
		if (start && !validMonth(start))
			return fail(400, { section: 'settings', error: 'Fund start should be a month' });
		const freq = str(f, 'frequency');
		setBudgetSetting(BUDGET_SETTINGS.tolerance, (tol as number | null) ?? 0);
		setBudgetSetting(BUDGET_SETTINGS.merchantGapMonths, gap);
		setBudgetSetting(BUDGET_SETTINGS.yearlyFundOpening, (open as number | null) ?? 0);
		setBudgetSetting(BUDGET_SETTINGS.yearlyFundStart, start || null);
		setBudgetSetting(BUDGET_SETTINGS.planPay, (plan as number | null) ?? null);
		if (['week', 'fortnight', 'month'].includes(freq))
			setBudgetSetting(BUDGET_SETTINGS.payFrequency, freq);
		return { section: 'settings', saved: true };
	}
};
