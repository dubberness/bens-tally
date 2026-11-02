import { describe, expect, it } from 'vitest';
import { PASS, testMail } from '../../src/lib/betashares/test-mail';
import { fakeD1 } from './fake-d1';
import { api, purge, receive, type Env } from './index';

const env = (): Env => ({
	DB: fakeD1(),
	APP_TOKEN: 'secret-token',
	IMPORT_ADDRESS: 'import@example.com',
	ALLOWED_SENDERS: 'orders@notification.betashares.com.au,updates@account.betashares.com.au',
	SENDER_DOMAIN: 'betashares.com.au',
	TRUSTED_AUTHSERV: 'mx.cloudflare.net'
});
const send = (e: Env, raw: string, to = 'import@example.com', from = 'fwd@example.com') =>
	receive({ from, to, rawSize: raw.length, raw: new Response(raw).body! }, e);
const call = (e: Env, path: string, init: RequestInit = {}, token = 'secret-token') =>
	api(
		new Request(`https://w.example${path}`, {
			...init,
			headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
		}),
		e
	);

describe('mail Worker', () => {
	it('keeps a Betashares email and hands it over once', async () => {
		const e = env();
		expect(await send(e, testMail({ messageId: 'm1' }))).toEqual({ kept: true });
		// The same message again (forwarded twice) isn't kept twice.
		await send(e, testMail({ messageId: 'm1' }));
		const r = (await (await call(e, '/messages')).json()) as {
			messages: { id: string; parsed: string; raw: string }[];
		};
		expect(r.messages).toHaveLength(1);
		expect(JSON.parse(r.messages[0].parsed)).toMatchObject({
			kind: 'trade',
			ticker: 'VAS',
			unitsE6: 2_500_000
		});
		expect(r.messages[0].raw).toContain('Order ID');
		await call(e, '/ack', { method: 'POST', body: JSON.stringify({ ids: [r.messages[0].id] }) });
		const again = (await (await call(e, '/messages')).json()) as { messages: unknown[] };
		expect(again.messages).toHaveLength(0);
		const status = (await (await call(e, '/status')).json()) as Record<string, unknown>;
		expect(status).toMatchObject({ pending: 0, collected: 1, rejected: 0 });
	});

	it('refuses other senders, other addresses and failed or forged checks', async () => {
		const e = env();
		expect((await send(e, testMail({ from: 'someone@example.org' }))).kept).toBe(false);
		expect((await send(e, testMail(), 'other@example.com')).kept).toBe(false);
		expect(
			(
				await send(
					e,
					testMail({ auth: ['mx.cloudflare.net; dkim=fail header.d=betashares.com.au'] })
				)
			).kept
		).toBe(false);
		// A passing result written lower down by the sender doesn't count.
		expect((await send(e, testMail({ auth: ['mx.cloudflare.net; dkim=none', PASS] }))).kept).toBe(
			false
		);
		// Nor does one from a server that isn't trusted.
		expect(
			(await send(e, testMail({ auth: [PASS.replace('mx.cloudflare.net', 'mx.example.org')] })))
				.kept
		).toBe(false);
		const status = (await (await call(e, '/status')).json()) as {
			rejected: number;
			refused: { reason: string }[];
		};
		expect(status.rejected).toBe(5);
		expect(status.refused.map((r) => r.reason)).toContain('Not sent to the import address');
	});

	it('lets the Gmail forwarding confirmation through so its code can be read', async () => {
		const e = env();
		const raw = testMail({
			from: 'forwarding-noreply@google.com',
			subject: '(#123456789) Gmail Forwarding Confirmation - Receive Mail from someone',
			auth: ['mx.cloudflare.net; dkim=pass header.d=google.com'],
			body: 'Confirmation code: 123456789'
		});
		expect((await send(e, raw)).kept).toBe(true);
		const r = (await (await call(e, '/messages')).json()) as { messages: { parsed: string }[] };
		expect(JSON.parse(r.messages[0].parsed).reason).toMatch(/Code 123456789/);
	});

	it('checks the envelope sender when told to', async () => {
		const e = { ...env(), FORWARDED_BY: 'fwd@example.com' };
		expect((await send(e, testMail(), 'import@example.com', 'fwd@example.com')).kept).toBe(true);
		expect((await send(e, testMail(), 'import@example.com', 'x@example.org')).kept).toBe(false);
	});

	it('needs the token', async () => {
		const e = env();
		expect((await call(e, '/messages', {}, 'wrong')).status).toBe(401);
		expect((await call(e, '/status', {}, '')).status).toBe(401);
	});

	it('deletes collected and refused mail after the keep period, never uncollected', async () => {
		const e = env();
		await send(e, testMail({ messageId: 'a' }));
		await send(e, testMail({ from: 'x@example.org' }));
		await purge(e, Date.now() + 31 * 86_400_000);
		const s = (await (await call(e, '/status')).json()) as Record<string, number>;
		expect(s).toMatchObject({ pending: 1, rejected: 0 });
	});
});
