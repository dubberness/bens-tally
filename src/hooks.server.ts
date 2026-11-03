import { redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { readSession } from '$lib/server/auth/session';
import {
	apiAccess,
	noteApiCall,
	READ_METHODS,
	viaTunnel,
	type ApiAccess
} from '$lib/server/auth/api';
import { skipLogin } from '$lib/server/env';
import { theme } from '$lib/server/history/prefs';
import { applyTheme, themeOf } from '$lib/theme';
import { startScheduler } from '$lib/server/jobs/scheduler';

if (!building) startScheduler();

/** Paths that work without signing in. Everything else needs a session. */
const PUBLIC = ['/api/health', '/auth/', '/signin'];
const isPublic = (path: string) =>
	PUBLIC.some((p) =>
		p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)
	);

const refuse = (status: number, error: string) =>
	new Response(JSON.stringify({ error }), {
		status,
		headers: { 'content-type': 'application/json' }
	});

export const handle: Handle = async ({ event, resolve }) => {
	const secure = event.url.protocol === 'https:';
	event.locals.user = skipLogin
		? { subject: 'dev', name: 'Developer', email: null }
		: readSession(event.cookies, secure);

	let api: ApiAccess | null = null;
	const auth = event.request.headers.get('authorization');
	if (!event.locals.user && auth?.startsWith('Bearer ')) {
		if (viaTunnel(event.request.headers))
			return refuse(403, 'Tokens only work on the home network');
		api = apiAccess(auth.slice(7).trim());
		if (!api) return refuse(401, 'Unknown token');
		if (api === 'read' && !READ_METHODS.includes(event.request.method))
			return refuse(403, 'This token can only read');
		event.locals.user = {
			subject: `api:${api}`,
			name: api === 'read' ? 'Claude (read only)' : 'Claude',
			email: null
		};
	}

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

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => applyTheme(html, themeOf(theme()))
	});
	if (api)
		noteApiCall({
			at: Date.now(),
			access: api,
			method: event.request.method,
			path: event.url.pathname + event.url.search,
			status: response.status
		});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (secure) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
	if (event.locals.user) response.headers.set('Cache-Control', 'private, no-store');
	return response;
};
