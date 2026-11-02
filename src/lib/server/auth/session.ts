import type { Cookies } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db, schema } from '../db';

export const SESSION_COOKIE = 'tally_session';
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;

export interface SessionUser {
	subject: string;
	name: string | null;
	email: string | null;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(
	cookies: Cookies,
	user: SessionUser,
	secure: boolean,
	userAgent?: string
) {
	const token = randomBytes(32).toString('base64url');
	const now = Date.now();
	const expiresAt = new Date(now + SESSION_DAYS * DAY);
	db.insert(schema.sessions)
		.values({
			id: hash(token),
			subject: user.subject,
			name: user.name,
			email: user.email,
			createdAt: new Date(now),
			lastSeenAt: new Date(now),
			expiresAt,
			userAgent: userAgent?.slice(0, 200) ?? null
		})
		.run();
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		expires: expiresAt
	});
}

/** Look up the cookie's session; renews it once a day so a used device stays signed in. */
export function readSession(cookies: Cookies, secure: boolean): SessionUser | null {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const id = hash(token);
	const row = db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
	const now = Date.now();
	if (!row || row.expiresAt.getTime() <= now) {
		if (row) db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return null;
	}
	if (now - row.lastSeenAt.getTime() > DAY) {
		const expiresAt = new Date(now + SESSION_DAYS * DAY);
		db.update(schema.sessions)
			.set({ lastSeenAt: new Date(now), expiresAt })
			.where(eq(schema.sessions.id, id))
			.run();
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure,
			expires: expiresAt
		});
	}
	return { subject: row.subject, name: row.name, email: row.email };
}

export function endSession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token)
		db.delete(schema.sessions)
			.where(eq(schema.sessions.id, hash(token)))
			.run();
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function pruneSessions() {
	return db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).run().changes;
}
