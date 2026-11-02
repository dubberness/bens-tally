import { fail } from '@sveltejs/kit';
import { getSetting, setSetting } from '$lib/server/settings';
import {
	CLOSED_KEY,
	LAST_KEY,
	runSheetImport,
	sheetImportClosed,
	type SheetImportResult
} from '$lib/server/import/sheet';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	last: getSetting<SheetImportResult>(LAST_KEY) ?? null,
	closed: sheetImportClosed()
});

export const actions: Actions = {
	upload: async ({ request }) => {
		if (sheetImportClosed()) return fail(400, { message: 'The sheet import is switched off.' });
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { message: 'Choose the .xlsx export of the sheet first.' });
		if (!file.name.toLowerCase().endsWith('.xlsx'))
			return fail(400, {
				message: 'That isn’t an .xlsx file. In Google Sheets use File › Download › Microsoft Excel.'
			});
		try {
			const result = runSheetImport(new Uint8Array(await file.arrayBuffer()), file.name);
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
