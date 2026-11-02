import { redirect } from '@sveltejs/kit';
import { safeReturn } from '$lib/server/auth/oidc';
import type { PageServerLoad } from './$types';

const MESSAGES: Record<string, string> = {
	unavailable: "Couldn't reach Pocket-ID. Try again in a minute.",
	expired: 'That sign-in took too long or was opened in another browser. Try again.',
	failed: "Pocket-ID didn't confirm the sign-in. Try again.",
	refused: "That Pocket-ID account isn't allowed into Ben's Tally.",
	busy: 'Too many attempts. Wait a few minutes and try again.'
};

export const load: PageServerLoad = ({ locals, url }) => {
	const to = safeReturn(url.searchParams.get('to'));
	if (locals.user) redirect(303, to);
	const code = url.searchParams.get('error');
	return {
		to,
		error: code ? (MESSAGES[code] ?? MESSAGES.failed) : null,
		signedOut: url.searchParams.has('signedout')
	};
};
