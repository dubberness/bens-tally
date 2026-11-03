import { exportJson, exportName } from '$lib/server/export';
import type { RequestHandler } from './$types';

/** Every table in one JSON file. */
export const GET: RequestHandler = () =>
	new Response(exportJson(), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${exportName('json')}"`
		}
	});
