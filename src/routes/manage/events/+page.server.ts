import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { allAccounts } from '$lib/server/history/snapshots';
import { localDate } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	events: db
		.select()
		.from(schema.events)
		.orderBy(asc(schema.events.date), asc(schema.events.id))
		.all(),
	accounts: allAccounts().map((a) => ({ id: a.id, name: a.name })),
	today: localDate()
});

function read(f: FormData) {
	const date = String(f.get('date') ?? '');
	const title = String(f.get('title') ?? '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick a date' } as const;
	if (!title) return { error: 'Give it a title' } as const;
	const acct = Number(f.get('accountId'));
	return {
		values: {
			date,
			title,
			note: String(f.get('note') ?? '').trim() || null,
			accountId: acct > 0 ? acct : null
		}
	} as const;
}

export const actions: Actions = {
	add: async ({ request }) => {
		const r = read(await request.formData());
		if ('error' in r) return fail(400, { error: r.error });
		db.insert(schema.events)
			.values({ ...r.values, createdAt: new Date() })
			.run();
		return { saved: true };
	},
	update: async ({ request }) => {
		const f = await request.formData();
		const r = read(f);
		if ('error' in r) return fail(400, { error: r.error, id: Number(f.get('id')) });
		db.update(schema.events)
			.set({ ...r.values, dismissed: f.get('dismissed') === 'on' })
			.where(eq(schema.events.id, Number(f.get('id'))))
			.run();
		return { saved: true };
	},
	delete: async ({ request }) => {
		db.delete(schema.events)
			.where(eq(schema.events.id, Number((await request.formData()).get('id'))))
			.run();
		return { deleted: true };
	}
};
