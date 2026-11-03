import { error, fail, redirect } from '@sveltejs/kit';
import { asc, isNull } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { ACTIONS, ACTION_LABELS, type RuleMatch } from '$lib/budget/rules';
import { createRule, deleteRule, loadRules, testRule, updateRule } from '$lib/server/budget/engine';
import { knownLabels, readRuleForm } from '$lib/server/budget/rules-form';
import type { Actions, PageServerLoad } from './$types';

const ruleOf = (id: string) => {
	if (id === 'new') return null;
	const r = loadRules().find((x) => x.id === Number(id));
	if (!r) error(404, 'No such rule');
	return r;
};

export const load: PageServerLoad = ({ params, url }) => {
	const rule = ruleOf(params.id);
	const q = url.searchParams;
	const match: RuleMatch = rule?.match ?? {
		merchant: q.get('merchant') ?? undefined,
		description: q.get('description') ?? undefined,
		category: q.get('category') ?? undefined
	};
	// A merchant passed in the address (from a check's fix) replaces the stored one for editing.
	if (rule && q.get('merchant')) match.merchant = q.get('merchant')!;
	const initial = {
		name: rule?.name ?? q.get('name') ?? '',
		enabled: rule?.enabled ?? true,
		match,
		action: rule?.action ?? q.get('action') ?? 'budget',
		budgetLineId: rule?.budgetLineId ?? (Number(q.get('line')) || null),
		label: rule?.label ?? q.get('label') ?? ''
	};
	return {
		id: rule?.id ?? null,
		initial,
		suggestedMerchant: rule && q.get('merchant') ? q.get('merchant') : null,
		lines: db
			.select({ id: schema.budgetLines.id, name: schema.budgetLines.name })
			.from(schema.budgetLines)
			.orderBy(asc(schema.budgetLines.sortOrder), asc(schema.budgetLines.id))
			.all(),
		accounts: db
			.select({ id: schema.accounts.id, name: schema.accounts.name })
			.from(schema.accounts)
			.where(isNull(schema.accounts.closedOn))
			.orderBy(asc(schema.accounts.sortOrder), asc(schema.accounts.name))
			.all(),
		labels: knownLabels(),
		actions: ACTIONS.map((a) => ({ value: a, label: ACTION_LABELS[a] })),
		test: rule ? summary(testRule(rule.match, { ruleId: rule.id })) : null
	};
};

type Tested = ReturnType<typeof testRule>;
const summary = (t: Tested) => ({
	count: t.count,
	outCents: t.outCents,
	inCents: t.inCents,
	total: t.hits.length,
	hits: t.hits.slice(0, 40).map((h) => ({
		id: h.tx.id,
		date: h.tx.date,
		description: h.tx.description,
		amountCents: h.tx.amountCents,
		shadowedBy: h.shadowedBy
	}))
});

export const actions: Actions = {
	test: async ({ request, params }) => {
		const rule = ruleOf(params.id);
		const f = await request.formData();
		const input = readRuleForm(f);
		if (typeof input === 'string') return fail(400, { error: input });
		const position = f.get('position') === 'last' ? 'last' : 'first';
		return { test: summary(testRule(input.match, { ruleId: rule?.id ?? null, position })) };
	},
	save: async ({ request, params }) => {
		const rule = ruleOf(params.id);
		const f = await request.formData();
		const input = readRuleForm(f);
		if (typeof input === 'string') return fail(400, { error: input });
		if (!rule) {
			const made = createRule(input, f.get('position') === 'last' ? 'last' : 'first');
			redirect(303, `/manage/rules/${made.id}?added=1`);
		}
		updateRule(rule.id, input);
		return { saved: true };
	},
	delete: async ({ params }) => {
		const rule = ruleOf(params.id);
		if (rule) deleteRule(rule.id);
		redirect(303, '/manage/rules');
	}
};
