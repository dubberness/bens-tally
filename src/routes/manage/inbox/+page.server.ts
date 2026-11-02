import { fail } from '@sveltejs/kit';
import { CSV_FIELDS } from '$lib/betashares/csv';
import { applyCsv, mappingFrom, previewCsv } from '$lib/server/invest/csv-import';
import { inboxItems, resolveItem, type InboxAction } from '$lib/server/invest/inbox';
import { emailStatus } from '$lib/server/invest/email';
import { emailJob } from '$lib/server/invest/jobs';
import { lastRun, runJob } from '$lib/server/jobs/scheduler';
import type { Actions, PageServerLoad } from './$types';

const ACTIONS: InboxAction[] = ['use-file', 'keep', 'add', 'ignore', 'reopen'];
/** Betashares' full history is a few hundred rows; this is plenty. */
const MAX_BYTES = 2 * 1024 * 1024;

export const load: PageServerLoad = () => {
	const { review, done, trades, distributions } = inboxItems();
	return {
		review,
		done,
		trades: Object.fromEntries(trades),
		distributions,
		email: { ...emailStatus(), lastRun: lastRun(emailJob.id) ?? null },
		fields: CSV_FIELDS
	};
};

function preview(text: string, fileName: string, f?: FormData) {
	try {
		const p = previewCsv(text, f ? mappingFrom(f) : undefined);
		return { preview: p, text, fileName };
	} catch (e) {
		return fail(400, { csvError: e instanceof Error ? e.message : String(e) });
	}
}

export const actions: Actions = {
	upload: async ({ request }) => {
		const f = await request.formData();
		const file = f.get('file');
		if (!(file instanceof File) || !file.size) return fail(400, { csvError: 'Pick a CSV file.' });
		if (file.size > MAX_BYTES) return fail(400, { csvError: 'That file is too big for a CSV.' });
		return preview(await file.text(), file.name);
	},
	remap: async ({ request }) => {
		const f = await request.formData();
		return preview(String(f.get('text') ?? ''), String(f.get('fileName') ?? 'upload.csv'), f);
	},
	apply: async ({ request }) => {
		const f = await request.formData();
		const text = String(f.get('text') ?? '');
		const missing = CSV_FIELDS.filter((x) => x.required && mappingFrom(f)[x.key] < 0);
		if (missing.length)
			return fail(400, {
				csvError: `Pick a column for ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`
			});
		try {
			return { applied: applyCsv(text, mappingFrom(f), String(f.get('fileName') ?? 'upload.csv')) };
		} catch (e) {
			return fail(400, { csvError: e instanceof Error ? e.message : String(e) });
		}
	},
	check: async () => {
		const r = await runJob(emailJob);
		return { checked: r.message, ok: r.ok };
	},
	resolve: async ({ request }) => {
		const f = await request.formData();
		const action = String(f.get('action')) as InboxAction;
		if (!ACTIONS.includes(action)) return fail(400, { itemError: 'Unknown choice.', itemId: 0 });
		const id = Number(f.get('id'));
		const err = resolveItem(id, action);
		if (err) return fail(400, { itemError: err, itemId: id });
		return { resolved: id };
	}
};
