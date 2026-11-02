import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { priceOn } from '$lib/server/invest/holdings';
import {
	deleteInstrument,
	FREQUENCIES,
	investmentAccounts,
	readInstrumentForm,
	updateInstrument
} from '$lib/server/invest/instruments-admin';
import type { Actions, PageServerLoad } from './$types';

const find = (id: number) =>
	db.select().from(schema.instruments).where(eq(schema.instruments.id, id)).get();

export const load: PageServerLoad = ({ params }) => {
	const i = find(Number(params.id));
	if (!i) error(404, 'No such fund');
	const used =
		!!db
			.select({ id: schema.trades.id })
			.from(schema.trades)
			.where(eq(schema.trades.instrumentId, i.id))
			.get() ||
		!!db
			.select({ id: schema.distributions.id })
			.from(schema.distributions)
			.where(eq(schema.distributions.instrumentId, i.id))
			.get();
	return {
		instrument: i,
		deletable: !used,
		price: priceOn(i, null),
		accounts: investmentAccounts(),
		frequencies: FREQUENCIES
	};
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const id = Number(params.id);
		if (!find(id)) error(404, 'No such fund');
		const v = readInstrumentForm(await request.formData());
		if (typeof v === 'string') return fail(400, { error: v });
		const err = updateInstrument(id, v);
		if (err) return fail(400, { error: err });
		return { saved: true };
	},
	delete: async ({ params }) => {
		const err = deleteInstrument(Number(params.id));
		if (err) return fail(400, { error: err });
		redirect(303, '/manage/instruments');
	}
};
