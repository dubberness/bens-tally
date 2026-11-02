import * as client from 'openid-client';
import { oidc } from '../env';
import { getSetting, setSetting } from '../settings';
import { log } from '../log';

export const OIDC_COOKIE = 'tally_oidc';

/** Only same-site paths, so a crafted link can't bounce someone off to another site. */
export function safeReturn(to: string | null | undefined): string {
	return to &&
		to.startsWith('/') &&
		!to.startsWith('//') &&
		!to.startsWith('/\\') &&
		!to.startsWith('/auth/')
		? to
		: '/';
}

let configPromise: Promise<client.Configuration> | null = null;

/** Pocket-ID's discovery document, fetched once and retried after a failure. */
export function oidcConfig(): Promise<client.Configuration> {
	if (!oidc.issuer || !oidc.clientId || !oidc.clientSecret) {
		return Promise.reject(
			new Error(
				'Sign-in is not set up: OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are needed.'
			)
		);
	}
	configPromise ??= client
		.discovery(new URL(oidc.issuer), oidc.clientId, oidc.clientSecret)
		.catch((err) => {
			configPromise = null;
			throw err;
		});
	return configPromise;
}

export interface Owner {
	subject: string;
	name: string | null;
	email: string | null;
	claimedAt: string;
}

/**
 * Who may sign in. With OIDC_ALLOWED_SUBJECTS set, only those subjects. Otherwise the first
 * person to sign in becomes the owner and nobody else gets in.
 */
export function admit(subject: string, name: string | null, email: string | null): boolean {
	if (oidc.allowedSubjects.length) return oidc.allowedSubjects.includes(subject);
	const owner = getSetting<Owner>('owner');
	if (!owner) {
		setSetting('owner', { subject, name, email, claimedAt: new Date().toISOString() });
		log('info', 'First sign-in: owner recorded', { subject, email });
		return true;
	}
	return owner.subject === subject;
}

export { client };
