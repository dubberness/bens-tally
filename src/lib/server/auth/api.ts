import { createHash, timingSafeEqual } from 'node:crypto';
import { apiTokens } from '../env';

/*
 * Token access for scripts on the home network. A read token can open any page or GET
 * endpoint; a write token can also post the app's forms, so every change goes through the
 * same code (and edit history) as a change made by hand. Requests that came through the
 * Cloudflare tunnel are refused, so the tokens only work from inside the house.
 */

export type ApiAccess = 'read' | 'write';

/** Shorter tokens are ignored: they'd be guessable. */
export const MIN_TOKEN_LENGTH = 32;

const digest = (s: string) => createHash('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export function apiAccess(
	token: string,
	tokens: { read: string; write: string } = apiTokens
): ApiAccess | null {
	if (!token) return null;
	const ok = (t: string) => t.length >= MIN_TOKEN_LENGTH && same(token, t);
	// Both compared every time, so the answer doesn't take longer for one than the other.
	const write = ok(tokens.write);
	const read = ok(tokens.read);
	return write ? 'write' : read ? 'read' : null;
}

/** Cloudflare adds these to everything it forwards; nothing on the home network sends them. */
export const viaTunnel = (headers: Headers) =>
	headers.has('cf-connecting-ip') || headers.has('cf-ray');

export const READ_METHODS = ['GET', 'HEAD'];

export interface ApiCall {
	at: number;
	access: ApiAccess;
	method: string;
	path: string;
	status: number;
}

/** The last few token requests, shown in Manage. Kept in memory only; a restart clears it. */
const calls: ApiCall[] = [];
export function noteApiCall(c: ApiCall) {
	calls.unshift(c);
	calls.length = Math.min(calls.length, 50);
	if (c.access === 'write' && !READ_METHODS.includes(c.method))
		console.log(`[api] ${c.method} ${c.path} → ${c.status}`);
}
export const recentApiCalls = () => calls.slice();

export const apiStatus = () => ({
	read: apiTokens.read.length >= MIN_TOKEN_LENGTH,
	write: apiTokens.write.length >= MIN_TOKEN_LENGTH,
	tooShort: [apiTokens.read, apiTokens.write].some((t) => t && t.length < MIN_TOKEN_LENGTH)
});
