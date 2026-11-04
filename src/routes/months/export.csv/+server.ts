import { monthsCsv } from '$lib/server/history/months';
import { localDate } from '$lib/time';
import type { RequestHandler } from './$types';

/** Every month: net worth, the breakdown, the note and each account's value. */
export const GET: RequestHandler = () =>
	new Response(monthsCsv(), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="tally-months-${localDate()}.csv"`
		}
	});
