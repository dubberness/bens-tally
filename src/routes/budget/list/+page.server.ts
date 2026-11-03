import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { ACTION_LABELS, ACTIONS, type Action } from '$lib/budget/rules';
import { assignByHand, clearHand, createRule } from '$lib/server/budget/engine';
import { knownLabels } from '$lib/server/budget/rules-form';
import { parseTarget } from '$lib/server/budget/targets';
import { inMonth, txViews } from '$lib/server/budget/month';
import { NO_LABEL } from '$lib/server/budget/spending';
import { localMonth } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

const t = schema.transactions;
const a = schema.assignments;

/** "line:3", "none", "person:Name" or "action:one_off" → what to list and what to call it. */
function scope(target: string, month: string) {
	const [kind, ...rest] = target.split(':');
	const arg = rest.join(':');
	if (kind === 'none')
		return { title: 'Not sorted yet', rows: txViews(and(inMonth(month), isNull(a.action))) };
	if (kind === 'line') {
		const line = db
			.select()
			.from(schema.budgetLines)
			.where(eq(schema.budgetLines.id, Number(arg)))
			.get();
		if (!line) error(404, 'No such budget line');
		return {
			title: line.name,
			rows: txViews(and(inMonth(month), eq(a.budgetLineId, line.id))),
			line: line.id
		};
	}
	if (kind === 'person')
		return {
			title: `Paid for ${arg}`,
			rows: txViews(and(inMonth(month), eq(a.action, 'other_person'))).filter(
				(x) => (x.label?.trim() || NO_LABEL) === arg
			)
		};
	if (kind === 'action' && (ACTIONS as readonly string[]).includes(arg))
		return {
			title: ACTION_LABELS[arg as Action],
			rows: txViews(and(inMonth(month), eq(a.action, arg)))
		};
	error(404, 'Nothing to list');
}

export const load: PageServerLoad = ({ url }) => {
	const target = url.searchParams.get('for') ?? 'none';
	const asked = url.searchParams.get('m') ?? '';
	const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : localMonth();
	const s = scope(target, month);
	const LIMIT = 200;
	const total = s.rows.reduce((x, r) => x + r.amountCents, 0);
	return {
		target,
		month,
		title: s.title,
		total,
		count: s.rows.length,
		rows: s.rows.slice(0, LIMIT),
		more: Math.max(0, s.rows.length - LIMIT),
		lines: db
			.select({ id: schema.budgetLines.id, name: schema.budgetLines.name })
			.from(schema.budgetLines)
			.orderBy(asc(schema.budgetLines.sortOrder), asc(schema.budgetLines.id))
			.all(),
		labels: knownLabels(),
		actions: (
			['other_person', 'transfer', 'income', 'one_off', 'investing', 'repayment'] as const
		).map((v) => ({ value: v, label: ACTION_LABELS[v] }))
	};
};

export const actions: Actions = {
	assign: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const target = parseTarget(String(f.get('to') ?? ''), String(f.get('newLabel') ?? ''));
		if (typeof target === 'string') return fail(400, { id, error: target });
		if (
			!db
				.select({ n: sql`1` })
				.from(t)
				.where(eq(t.id, id))
				.get()
		)
			return fail(404, { id, error: 'That transaction is gone' });
		assignByHand(id, target);
		return { id, saved: true };
	},
	always: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('id') ?? '');
		const target = parseTarget(String(f.get('to') ?? ''), String(f.get('newLabel') ?? ''));
		if (typeof target === 'string') return fail(400, { id, error: target });
		const tx = db.select().from(t).where(eq(t.id, id)).get();
		if (!tx) return fail(404, { id, error: 'That transaction is gone' });
		createRule({
			name: tx.description,
			enabled: true,
			match: { merchant: tx.description },
			action: target.action,
			budgetLineId: target.budgetLineId ?? null,
			label: target.label ?? null
		});
		// The new rule covers every transaction from this merchant, so this one's hand choice goes.
		clearHand(id);
		return { id, saved: true, rule: tx.description };
	},
	clear: async ({ request }) => {
		const f = await request.formData();
		clearHand(String(f.get('id') ?? ''));
		return { id: String(f.get('id') ?? ''), saved: true };
	}
};
