import { fail } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { asc } from 'drizzle-orm';
import { describeMatch, ACTION_LABELS, type Action } from '$lib/budget/rules';
import { loadRules, moveRule, setRuleEnabled } from '$lib/server/budget/engine';
import { ruleCounts } from '$lib/server/budget/rules-form';
import { suggestLineRules } from '$lib/server/budget/starter';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const accounts = new Map(
		db
			.select()
			.from(schema.accounts)
			.all()
			.map((a) => [a.id, a.name])
	);
	const lines = new Map(
		db
			.select()
			.from(schema.budgetLines)
			.orderBy(asc(schema.budgetLines.sortOrder))
			.all()
			.map((l) => [l.id, l.name])
	);
	const counts = ruleCounts();
	return {
		rules: loadRules().map((r) => ({
			id: r.id,
			name: r.name,
			enabled: r.enabled,
			describe: describeMatch(r.match, (id) => accounts.get(id) ?? `#${id}`),
			action: r.action,
			actionLabel: ACTION_LABELS[r.action as Action] ?? r.action,
			line: r.budgetLineId != null ? (lines.get(r.budgetLineId) ?? null) : null,
			label: r.label,
			count: counts.get(r.id) ?? 0
		}))
	};
};

export const actions: Actions = {
	toggle: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (!id) return fail(400, { message: 'Which rule?' });
		setRuleEnabled(id, f.get('enabled') === '1');
		return { ok: true };
	},
	move: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		const dir = f.get('dir') === 'up' ? -1 : 1;
		if (!id) return fail(400, { message: 'Which rule?' });
		moveRule(id, dir);
		return { ok: true };
	},
	suggest: () => {
		return { suggested: suggestLineRules('app') };
	}
};
