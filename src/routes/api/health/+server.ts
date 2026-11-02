import { json } from '@sveltejs/kit';
import { sqlite } from '$lib/server/db';
import { buildSha } from '$lib/server/env';
import type { RequestHandler } from './$types';

/** Unauthenticated: used by the Docker health check and uptime monitors. Reveals nothing personal. */
export const GET: RequestHandler = () => {
	try {
		sqlite.prepare('select 1').get();
		return json({ ok: true, version: buildSha });
	} catch {
		return json({ ok: false, version: buildSha }, { status: 503 });
	}
};
