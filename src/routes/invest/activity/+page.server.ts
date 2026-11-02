import { activity } from '$lib/server/invest/view';
import { fundChoices } from '$lib/server/invest/records';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const funds = fundChoices();
	const fund = funds.find((f) => f.ticker === url.searchParams.get('fund')) ?? null;
	const k = url.searchParams.get('kind');
	const kind = k === 'trades' || k === 'distributions' ? k : null;
	return {
		funds,
		fund: fund?.ticker ?? '',
		kind: kind ?? '',
		rows: activity(5000, { instrumentId: fund?.id ?? null, kind })
	};
};
