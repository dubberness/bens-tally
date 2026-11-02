import { fail } from '@sveltejs/kit';
import { setSetting } from '$lib/server/settings';
import { LOT_METHOD_KEY, lotMethod } from '$lib/server/invest/holdings';
import { LOT_METHODS, type LotMethod } from '$lib/server/invest/lots';
import { parsePercentBp } from '$lib/server/invest/instruments-admin';
import { deleteTaxRule, saveTaxRule, taxRules } from '$lib/server/invest/tax';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	rules: taxRules(),
	method: lotMethod(),
	methods: LOT_METHODS
});

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function readRule(f: FormData) {
	const fromDate = String(f.get('fromDate') ?? '');
	const toDate = String(f.get('toDate') ?? '') || null;
	const discountBp = parsePercentBp(String(f.get('discount') ?? ''));
	const holdingMonths = Number(f.get('months'));
	if (!isDate(fromDate)) return 'Pick the date the rule starts.';
	if (toDate && (!isDate(toDate) || toDate < fromDate))
		return 'The end date must be after the start.';
	if (discountBp == null || discountBp === 'bad') return 'Discount must be a percentage, like 50.';
	if (!Number.isInteger(holdingMonths) || holdingMonths < 0 || holdingMonths > 600)
		return 'Holding period must be a whole number of months.';
	return {
		fromDate,
		toDate,
		discountBp,
		holdingMonths,
		note: String(f.get('note') ?? '').trim() || null
	};
}

export const actions: Actions = {
	save: async ({ request }) => {
		const f = await request.formData();
		const v = readRule(f);
		if (typeof v === 'string') return fail(400, { error: v, id: String(f.get('id') ?? '') });
		const id = Number(f.get('id')) || null;
		saveTaxRule(id, v);
		return { saved: id ? String(id) : 'new' };
	},
	delete: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('id'));
		if (taxRules().length <= 1)
			return fail(400, { error: 'Keep at least one rule.', id: String(id) });
		deleteTaxRule(id);
		return { deleted: true };
	},
	method: async ({ request }) => {
		const m = String((await request.formData()).get('method') ?? '') as LotMethod;
		if (!LOT_METHODS.includes(m)) return fail(400, { methodError: 'Pick a method.' });
		setSetting(LOT_METHOD_KEY, m);
		return { methodSaved: true };
	}
};
