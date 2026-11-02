import { fail } from '@sveltejs/kit';
import { getSetting, setSetting } from '$lib/server/settings';
import {
	areas,
	CLOSED_KEY,
	LAST_KEY,
	loadedAreas,
	runSheetImport,
	sheetImportClosed,
	type SheetImportResult
} from '$lib/server/import/sheet';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const loaded = loadedAreas();
	const closed = sheetImportClosed();
	return {
		last: getSetting<SheetImportResult>(LAST_KEY) ?? null,
		closed,
		// After go-live only a part the sheet never loaded can still be brought in.
		parts: areas
			.filter((a) => a.id !== 'history' && !a.pending)
			.map((a) => ({ id: a.id, label: a.label, loaded: loaded.includes(a.id) }))
			.filter((a) => !closed || !a.loaded),
		anyLoaded: loaded.length > 0
	};
};

export const actions: Actions = {
	upload: async ({ request }) => {
		const f = await request.formData();
		const part = String(f.get('part') ?? 'all');
		const only = part === 'all' ? undefined : [part];
		if (sheetImportClosed() && !only)
			return fail(400, { message: 'The sheet import is switched off.' });
		const file = f.get('file');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { message: 'Choose the .xlsx export of the sheet first.' });
		if (!file.name.toLowerCase().endsWith('.xlsx'))
			return fail(400, {
				message: 'That isn’t an .xlsx file. In Google Sheets use File › Download › Microsoft Excel.'
			});
		try {
			const result = runSheetImport(
				new Uint8Array(await file.arrayBuffer()),
				file.name,
				new Date(),
				only
			);
			return { done: true, ok: result.ok };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : String(err) });
		}
	},
	close: async ({ request }) => {
		const confirm = (await request.formData()).get('confirm');
		if (confirm !== 'yes') return fail(400, { message: 'Tick the box to confirm.' });
		setSetting(CLOSED_KEY, true);
		return { closed: true };
	}
};
