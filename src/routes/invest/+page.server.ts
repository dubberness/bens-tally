import { runChecks } from '$lib/server/checks';
import { localDate } from '$lib/time';
import { lotMethod } from '$lib/server/invest/holdings';
import { taxRules, taxYearOf, upcomingTaxDates } from '$lib/server/invest/tax';
import { activity, portfolio } from '$lib/server/invest/view';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const rules = taxRules();
	const today = localDate();
	const year = taxYearOf(today);
	const p = portfolio();
	const unrealised = p.valueCents - p.costCents;
	return {
		valueCents: p.valueCents,
		costCents: p.costCents,
		unrealisedCents: unrealised,
		realisedCents: p.realisedCents,
		distributionsCents: p.distributionsCents,
		allTimeCents: unrealised + p.realisedCents + p.distributionsCents,
		mix: p.mix,
		holdings: p.held.map((h) => ({
			id: h.instrument.id,
			ticker: h.instrument.ticker,
			name: h.instrument.name,
			unitsE6: h.unitsE6,
			costCents: h.costCents,
			valueCents: h.valueCents ?? 0,
			priceE4: h.price?.priceE4 ?? null,
			priceSource: h.price?.source ?? null,
			colour: p.colours.get(h.instrument.id)!
		})),
		priced: p.priced,
		checks: runChecks().filter((c) => c.key.startsWith('invest:')),
		activity: activity(30),
		tax: {
			label: year.label,
			start: year.start,
			end: year.end,
			today,
			totalCents: year.totalCents,
			netGainCents: year.netGainCents,
			carryForwardCents: year.carryForwardCents,
			broughtForwardCents: year.broughtForwardCents,
			method: lotMethod(),
			upcoming: upcomingTaxDates(rules, today).slice(0, 3),
			hasRules: rules.length > 0
		}
	};
};
