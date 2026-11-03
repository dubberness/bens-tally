import { exportName, exportZip } from '$lib/server/export';
import type { RequestHandler } from './$types';

/** One CSV per table, zipped. */
export const GET: RequestHandler = () =>
	new Response(new Uint8Array(exportZip()), {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${exportName('zip')}"`
		}
	});
