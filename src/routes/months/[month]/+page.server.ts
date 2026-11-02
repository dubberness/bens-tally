import { error, fail } from '@sveltejs/kit';
import { parseMoney } from '$lib/money';
import { monthDetail } from '$lib/server/history/months';
import { editLockedValue, editNote } from '$lib/server/history/snapshots';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	if (!/^\d{4}-\d{2}$/.test(params.month)) error(404, 'No such month');
	const detail = monthDetail(params.month);
	if (!detail) error(404, 'No snapshot for that month');
	return detail;
};

export const actions: Actions = {
	note: async ({ request, params }) => {
		const f = await request.formData();
		try {
			editNote(params.month, String(f.get('note') ?? ''), String(f.get('reason') ?? '') || null);
		} catch (err) {
			return fail(400, { noteError: err instanceof Error ? err.message : String(err) });
		}
		return { noteSaved: true };
	},
	value: async ({ request, params }) => {
		const f = await request.formData();
		const accountId = Number(f.get('accountId'));
		const raw = String(f.get('value') ?? '').trim();
		const value = raw === '' ? null : parseMoney(raw);
		if (raw !== '' && value == null)
			return fail(400, { valueError: 'That isn’t an amount', accountId });
		try {
			editLockedValue(params.month, accountId, value, String(f.get('reason') ?? ''));
		} catch (err) {
			return fail(400, { valueError: err instanceof Error ? err.message : String(err), accountId });
		}
		return { valueSaved: accountId };
	}
};
