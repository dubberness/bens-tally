import { redirect } from '@sveltejs/kit';
import { admit, client, oidcConfig, OIDC_COOKIE, safeReturn } from '$lib/server/auth/oidc';
import { createSession } from '$lib/server/auth/session';
import { allowAttempt } from '$lib/server/auth/limiter';
import { log } from '$lib/server/log';
import type { RequestHandler } from './$types';

interface Pending {
	verifier: string;
	state: string;
	nonce: string;
	returnTo: string;
}

export const GET: RequestHandler = async ({ url, cookies, request, getClientAddress }) => {
	if (!allowAttempt(getClientAddress())) redirect(303, '/signin?error=busy');

	const raw = cookies.get(OIDC_COOKIE);
	cookies.delete(OIDC_COOKIE, { path: '/auth' });
	if (!raw) redirect(303, '/signin?error=expired');
	let pending: Pending;
	try {
		pending = JSON.parse(raw);
	} catch {
		redirect(303, '/signin?error=expired');
	}

	let claims: client.IDToken | undefined;
	try {
		const config = await oidcConfig();
		const tokens = await client.authorizationCodeGrant(config, url, {
			pkceCodeVerifier: pending.verifier,
			expectedState: pending.state,
			expectedNonce: pending.nonce,
			idTokenExpected: true
		});
		claims = tokens.claims();
	} catch (err) {
		log('warn', 'Sign-in failed at the callback', { err: String(err) });
		redirect(303, '/signin?error=failed');
	}
	if (!claims?.sub) redirect(303, '/signin?error=failed');

	const name = typeof claims.name === 'string' ? claims.name : null;
	const email = typeof claims.email === 'string' ? claims.email : null;
	if (!admit(claims.sub, name, email)) {
		log('warn', 'Sign-in refused: not the owner', { subject: claims.sub, email });
		redirect(303, '/signin?error=refused');
	}

	createSession(
		cookies,
		{ subject: claims.sub, name, email },
		url.protocol === 'https:',
		request.headers.get('user-agent') ?? undefined
	);
	log('info', 'Signed in', { subject: claims.sub });
	redirect(303, safeReturn(pending.returnTo));
};
