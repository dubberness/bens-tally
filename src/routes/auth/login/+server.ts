import { error, redirect } from '@sveltejs/kit';
import { client, oidcConfig, OIDC_COOKIE, safeReturn } from '$lib/server/auth/oidc';
import { allowAttempt } from '$lib/server/auth/limiter';
import { log } from '$lib/server/log';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	if (!allowAttempt(getClientAddress()))
		error(429, 'Too many sign-in attempts. Try again in a few minutes.');

	let config;
	try {
		config = await oidcConfig();
	} catch (err) {
		log('error', 'Sign-in unavailable', { err: String(err) });
		redirect(303, '/signin?error=unavailable');
	}

	const verifier = client.randomPKCECodeVerifier();
	const state = client.randomState();
	const nonce = client.randomNonce();
	const target = client.buildAuthorizationUrl(config, {
		redirect_uri: `${url.origin}/auth/callback`,
		scope: 'openid profile email',
		code_challenge: await client.calculatePKCECodeChallenge(verifier),
		code_challenge_method: 'S256',
		state,
		nonce
	});

	cookies.set(
		OIDC_COOKIE,
		JSON.stringify({ verifier, state, nonce, returnTo: safeReturn(url.searchParams.get('to')) }),
		{
			path: '/auth',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 600
		}
	);
	redirect(303, target.href);
};
