import { runChecks } from '$lib/server/checks';
import { localDate } from '$lib/time';
import { lotMethod } from '$lib/server/invest/holdings';
import { inboxCount } from '$lib/server/invest/inbox';
import { emailStatus } from '$lib/server/invest/email';
import { emailJob } from '$lib/server/invest/jobs';
import { lastRun } from '$lib/server/jobs/scheduler';
import { taxRules, taxYearOf, upcomingTaxDates } from '$lib/server/invest/tax';
import { performance } from '$lib/server/invest/daily';
import { activity, portfolio } from '$lib/server/invest/view';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const rules = taxRules();
	const today = localDate();
	const year = taxYearOf(today);
	const p = portfolio();
	const perf = performance(today);
	const unrealised = p.valueCents - p.costCents;
	return {
		valueCents: p.valueCents,
		costCents: p.costCents,
		unrealisedCents: unrealised,
		realisedCents: p.realisedCents,
		distributionsCents: p.distributionsCents,
		allTimeCents: unrealised + p.realisedCents + p.distributionsCents,
		// Change since the previous close; null when there's nothing to compare with.
		day: perf.change && {
			cents: perf.change.cents,
			baseCents: perf.change.baseCents,
			label: perf.change.label
		},
		series: perf.series,
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
			colour: p.colours.get(h.instrument.id)!,
			// Only when it's from the same day as the total's figure.
			day:
				perf.change && perf.perFund.get(h.instrument.id)?.date === perf.change.date
					? perf.perFund.get(h.instrument.id)!
					: null
		})),
		priced: p.priced,
		checks: runChecks().filter((c) => c.key.startsWith('invest:')),
		activity: activity(12),
		inbox: inboxCount(),
		email: (() => {
			const st = emailStatus();
			const run = lastRun(emailJob.id);
			return {
				configured: st.configured,
				lastEmailAt: st.lastEmailAt,
				checkedAt: run?.startedAt ?? null,
				failed: run?.ok === false
			};
		})(),
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
