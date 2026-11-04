import { error } from '@sveltejs/kit';
import { localDate } from '$lib/time';
import { taxYearCsv, taxYearOf, taxYears } from '$lib/server/invest/tax';
import type { RequestHandler } from './$types';

/** The financial year starting in [fy] (e.g. 2026 for 2026–27) as a capital gains report. */
export const GET: RequestHandler = ({ params }) => {
	if (!/^\d{4}$/.test(params.fy)) error(404, 'No such financial year');
	const years = taxYears();
	const year =
		years.find((y) => y.start.slice(0, 4) === params.fy) ??
		// A year with no sales yet still has a (blank) report, like the page shows.
		(taxYearOf(localDate(), years).start.slice(0, 4) === params.fy
			? taxYearOf(localDate(), years)
			: null);
	if (!year) error(404, 'No such financial year');
	return new Response(taxYearCsv(year), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="capital-gains-${params.fy}-${String(Number(params.fy) + 1).slice(2)}.csv"`
		}
	});
};
