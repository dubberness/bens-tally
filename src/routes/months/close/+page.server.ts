import { fail } from '@sveltejs/kit';
import { parseMoney } from '$lib/money';
import { closeData } from '$lib/server/history/close';
import {
	getSnapshot,
	lockMonth,
	lockedSnapshots,
	type CloseEntry
} from '$lib/server/history/snapshots';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const m = url.searchParams.get('month');
	const data = closeData(undefined, m && /^\d{4}-\d{2}$/.test(m) ? m : undefined);
	return { ...data, note: data.month ? (getSnapshot(data.month)?.note ?? '') : '' };
};

export const actions: Actions = {
	lock: async ({ request }) => {
		const f = await request.formData();
		const month = String(f.get('month') ?? '');
		const data = closeData(undefined, month);
		if (!data.month) return fail(400, { error: 'There is no month to close.' });
		const entries: CloseEntry[] = [];
		for (const item of data.items) {
			const id = item.ids[0];
			if (item.type === 'manual') {
				const raw = String(f.get(`v_${id}`) ?? '').trim();
				const v = parseMoney(raw);
				if (v == null) return fail(400, { error: `Fill in ${item.name}.` });
				entries.push({ accountId: id, valueCents: Math.abs(v) });
			}
			if (item.type === 'estimate' && f.get(`keep_${id}`) === 'update') {
				const v = parseMoney(String(f.get(`v_${id}`) ?? ''));
				if (v == null)
					return fail(400, { error: `Fill in the new ${item.name} value, or keep it.` });
				entries.push({ accountId: id, valueCents: Math.abs(v), reestimate: true });
			}
		}
		try {
			lockMonth(data.month, entries, String(f.get('note') ?? ''));
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : String(err) });
		}
		return { locked: data.month, count: lockedSnapshots().length };
	}
};
