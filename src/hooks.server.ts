import { redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { readSession } from '$lib/server/auth/session';
import { skipLogin } from '$lib/server/env';
import { startScheduler } from '$lib/server/jobs/scheduler';

if (!building) startScheduler();

/** Paths that work without signing in. Everything else needs a session. */
const PUBLIC = ['/api/health', '/auth/', '/signin'];
const isPublic = (path: string) =>
	PUBLIC.some((p) =>
		p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)
	);

export const handle: Handle = async ({ event, resolve }) => {
	const secure = event.url.protocol === 'https:';
	event.locals.user = skipLogin
		? { subject: 'dev', name: 'Developer', email: null }
		: readSession(event.cookies, secure);

	if (!event.locals.user && !isPublic(event.url.pathname)) {
		if (event.url.pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Sign in required' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		const to = event.url.pathname + event.url.search;
		redirect(303, to === '/' ? '/signin' : `/signin?to=${encodeURIComponent(to)}`);
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (secure) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
	if (event.locals.user) response.headers.set('Cache-Control', 'private, no-store');
	return response;
};
