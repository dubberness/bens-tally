import { localDate } from '$lib/time';
import { lotMethod } from '$lib/server/invest/holdings';
import {
	openParcels,
	taxRules,
	taxYearOf,
	taxYears,
	upcomingTaxDates
} from '$lib/server/invest/tax';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const rules = taxRules();
	const today = localDate();
	const years = taxYears();
	const current = taxYearOf(today, years);
	const all = years.some((y) => y.start === current.start) ? years : [...years, current];
	const pick = url.searchParams.get('fy');
	const year = all.find((y) => y.start.slice(0, 4) === pick) ?? current;
	return {
		years: all.map((y) => ({ key: y.start.slice(0, 4), label: y.label })).reverse(),
		year,
		yearKey: year.start.slice(0, 4),
		parcels: openParcels(rules),
		upcoming: upcomingTaxDates(rules, today),
		method: lotMethod(),
		today
	};
};
