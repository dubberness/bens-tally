import { fail, redirect } from '@sveltejs/kit';
import { planContext } from '$lib/server/plan/context';
import { paramsFromForm } from '$lib/server/plan/form';
import {
	baseScenario,
	createScenario,
	deleteScenario,
	getScenario,
	listScenarios,
	makeBase,
	renameScenario,
	saveScenario
} from '$lib/server/plan/scenarios';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const scenarios = listScenarios();
	const asked = Number(url.searchParams.get('s'));
	const selected = (url.searchParams.has('s') ? getScenario(asked) : undefined) ?? baseScenario();
	return {
		scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault })),
		selected,
		ctx: planContext()
	};
};

const idOf = (f: FormData) => Number(f.get('id') ?? 0) || 0;
const nameOf = (f: FormData, k = 'name') => String(f.get(k) ?? '');
const go = (id: number) => redirect(303, id ? `/plan?s=${id}` : '/plan');

export const actions: Actions = {
	/** Save the assumptions into the scenario being looked at. */
	save: async ({ request }) => {
		const f = await request.formData();
		const params = paramsFromForm(f, planContext().accounts);
		if (typeof params === 'string') return fail(400, { section: 'save', error: params });
		const r = saveScenario(idOf(f), params);
		if (!r.ok) return fail(400, { section: 'save', error: r.error });
		if (r.id !== idOf(f)) go(r.id);
		return { section: 'save', saved: true };
	},
	/** Save the assumptions as a new, named what-if. */
	saveAs: async ({ request }) => {
		const f = await request.formData();
		const params = paramsFromForm(f, planContext().accounts);
		if (typeof params === 'string') return fail(400, { section: 'saveAs', error: params });
		// With nothing saved yet the first save is the base; a what-if needs a base to sit beside.
		if (idOf(f) === 0) {
			const base = saveScenario(0, params);
			if (!base.ok) return fail(400, { section: 'saveAs', error: base.error });
		}
		const r = createScenario(nameOf(f, 'newName'), params);
		if (!r.ok) return fail(400, { section: 'saveAs', error: r.error });
		go(r.id);
	},
	rename: async ({ request }) => {
		const f = await request.formData();
		const r = renameScenario(idOf(f), nameOf(f));
		if (!r.ok) return fail(400, { section: 'rename', error: r.error });
		return { section: 'rename', saved: true };
	},
	makeBase: async ({ request }) => {
		const r = makeBase(idOf(await request.formData()));
		if (!r.ok) return fail(400, { section: 'base', error: r.error });
		return { section: 'base', saved: true };
	},
	delete: async ({ request }) => {
		const r = deleteScenario(idOf(await request.formData()));
		if (!r.ok) return fail(400, { section: 'delete', error: r.error });
		go(r.id);
	}
};
