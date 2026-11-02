import { error, fail, redirect } from '@sveltejs/kit';
import {
	addTrade,
	deleteTrade,
	editsOf,
	findTrade,
	fundChoices,
	readTradeForm,
	updateTrade
} from '$lib/server/invest/records';
import type { Actions, PageServerLoad } from './$types';

const tradeOf = (id: string) => {
	if (id === 'new') return null;
	const t = findTrade(Number(id));
	if (!t) error(404, 'No such trade');
	return t;
};

export const load: PageServerLoad = ({ params, url }) => {
	const trade = tradeOf(params.id);
	const funds = fundChoices();
	return {
		trade,
		funds,
		fundId: trade?.instrumentId ?? funds.find((f) => f.ticker === url.searchParams.get('fund'))?.id,
		edits: trade ? editsOf('trade', trade.id) : []
	};
};

const reasonOf = (f: FormData) => String(f.get('reason') ?? '').trim() || null;

export const actions: Actions = {
	save: async ({ request, params }) => {
		const trade = tradeOf(params.id);
		const f = await request.formData();
		const v = readTradeForm(f);
		if (typeof v === 'string') return fail(400, { error: v });
		if (!trade) {
			const id = addTrade(v, 'manual');
			if (typeof id === 'string') return fail(400, { error: id });
			redirect(303, `/invest/trades/${id}?added=1`);
		}
		const err = updateTrade(trade.id, v, reasonOf(f));
		if (err) return fail(400, { error: err });
		return { saved: true };
	},
	delete: async ({ request, params }) => {
		const trade = tradeOf(params.id);
		if (!trade) error(404, 'No such trade');
		deleteTrade(trade.id, reasonOf(await request.formData()));
		redirect(303, '/invest/activity');
	}
};
