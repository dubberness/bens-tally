import { error, fail, redirect } from '@sveltejs/kit';
import {
	addDistribution,
	deleteDistribution,
	editsOf,
	findDistribution,
	fundChoices,
	readDistributionForm,
	updateDistribution
} from '$lib/server/invest/records';
import type { Actions, PageServerLoad } from './$types';

const distributionOf = (id: string) => {
	if (id === 'new') return null;
	const t = findDistribution(Number(id));
	if (!t) error(404, 'No such distribution');
	return t;
};

export const load: PageServerLoad = ({ params, url }) => {
	const distribution = distributionOf(params.id);
	const funds = fundChoices();
	return {
		distribution,
		funds,
		fundId:
			distribution?.instrumentId ??
			funds.find((f) => f.ticker === url.searchParams.get('fund'))?.id,
		edits: distribution ? editsOf('distribution', distribution.id) : []
	};
};

const reasonOf = (f: FormData) => String(f.get('reason') ?? '').trim() || null;

export const actions: Actions = {
	save: async ({ request, params }) => {
		const distribution = distributionOf(params.id);
		const f = await request.formData();
		const v = readDistributionForm(f);
		if (typeof v === 'string') return fail(400, { error: v });
		if (!distribution) {
			const id = addDistribution(v, 'manual');
			if (typeof id === 'string') return fail(400, { error: id });
			redirect(303, `/invest/distributions/${id}?added=1`);
		}
		const err = updateDistribution(distribution.id, v, reasonOf(f));
		if (err) return fail(400, { error: err });
		return { saved: true };
	},
	delete: async ({ request, params }) => {
		const distribution = distributionOf(params.id);
		if (!distribution) error(404, 'No such distribution');
		deleteDistribution(distribution.id, reasonOf(await request.formData()));
		redirect(303, '/invest/activity');
	}
};
