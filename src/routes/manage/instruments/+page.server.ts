import { fail, redirect } from '@sveltejs/kit';
import { holdings } from '$lib/server/invest/holdings';
import {
	createInstrument,
	investmentAccounts,
	parsePercentBp,
	readInstrumentForm,
	setDriftBand
} from '$lib/server/invest/instruments-admin';
import { driftBandBp, portfolio } from '$lib/server/invest/view';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const p = portfolio();
	const nowBp = new Map(p.mix.map((m) => [m.ticker, m.nowBp]));
	const list = holdings(null)
		.map((h) => ({
			id: h.instrument.id,
			ticker: h.instrument.ticker,
			name: h.instrument.name,
			held: h.unitsE6 > 0,
			unitsE6: h.unitsE6,
			valueCents: h.valueCents,
			targetBp: h.instrument.targetBp,
			nowBp: nowBp.get(h.instrument.ticker) ?? 0,
			priceSource: h.instrument.priceSource,
			priceE4: h.price?.priceE4 ?? null,
			priceDate: h.price?.date ?? null
		}))
		.sort((a, b) => Number(b.held) - Number(a.held) || (b.valueCents ?? 0) - (a.valueCents ?? 0));
	const targetTotal = list.reduce((s, i) => s + (i.targetBp ?? 0), 0);
	return { list, targetTotal, driftBandBp: driftBandBp(), accounts: investmentAccounts() };
};

export const actions: Actions = {
	add: async ({ request }) => {
		const f = await request.formData();
		const v = readInstrumentForm(f);
		if (typeof v === 'string') return fail(400, { addError: v });
		if (v.accountId == null) v.accountId = investmentAccounts()[0]?.id ?? null;
		const id = createInstrument(v);
		if (typeof id === 'string') return fail(400, { addError: id });
		redirect(303, `/manage/instruments/${id}`);
	},
	band: async ({ request }) => {
		const f = await request.formData();
		const bp = parsePercentBp(String(f.get('band') ?? ''));
		if (bp == null || bp === 'bad') return fail(400, { bandError: 'Enter a percentage, like 5.' });
		setDriftBand(bp);
		return { bandSaved: true };
	}
};
