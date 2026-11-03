import { fail } from '@sveltejs/kit';
import { dismissCheck, runChecks } from '$lib/server/checks';
import { budgetMonth } from '$lib/server/budget/month';
import { budgetSetting, setBudgetSetting, BUDGET_SETTINGS } from '$lib/server/budget/settings';
import { localMonth } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const asked = url.searchParams.get('m') ?? '';
	const current = localMonth();
	const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= current ? asked : current;
	const includeOneOffs = budgetSetting<boolean>(BUDGET_SETTINGS.includeOneOffs);
	return {
		current,
		view: budgetMonth(month, includeOneOffs),
		checks: runChecks().filter((c) => c.key.startsWith('budget:'))
	};
};

export const actions: Actions = {
	oneOffs: async ({ request }) => {
		const f = await request.formData();
		setBudgetSetting(BUDGET_SETTINGS.includeOneOffs, f.get('on') === '1');
		return { ok: true };
	},
	dismiss: async ({ request }) => {
		const f = await request.formData();
		const key = String(f.get('key') ?? '');
		if (!key) return fail(400, { message: 'Nothing to dismiss' });
		dismissCheck(key, String(f.get('fingerprint') ?? ''));
		return { ok: true };
	}
};
