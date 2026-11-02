/// <reference path="./types.d.ts" />
/**
 * Ben's Tally mail Worker. Cloudflare Email Routing hands it mail sent to the import
 * address; it keeps Betashares notifications (and Gmail's forwarding confirmation)
 * in D1 until the app collects them. Everything else is refused and only noted.
 *
 * HTTP, with `Authorization: Bearer <APP_TOKEN>`:
 *   GET  /status            counts, last mail, recent refusals
 *   GET  /messages?limit=n  mail not yet collected, oldest first, raw included
 *   POST /ack {ids: [...]}  the app has stored these; they're deleted after KEEP_DAYS
 */
import { checkMail, type GateConfig } from '../../src/lib/betashares/gate';
import { parseMail } from '../../src/lib/betashares/mime';
import { parseBetashares, PARSER_VERSION } from '../../src/lib/betashares/parse';

export interface Env {
	DB: D1Database;
	APP_TOKEN: string;
	IMPORT_ADDRESS: string;
	ALLOWED_SENDERS: string;
	SENDER_DOMAIN: string;
	TRUSTED_AUTHSERV: string;
	/** Optional: the envelope sender must contain this (Gmail's forwarding address). */
	FORWARDED_BY?: string;
	KEEP_DAYS?: string;
}

/** Betashares mail is under 100 KB; anything far bigger isn't theirs. */
const MAX_BYTES = 2 * 1024 * 1024;
const GMAIL_CONFIRM = 'forwarding-noreply@google.com';

const list = (s: string | undefined) =>
	(s ?? '')
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean);

/** Bytes to a one-char-per-byte string, which the MIME reader expects. */
function binary(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 8192)
		out += String.fromCharCode(...bytes.subarray(i, i + 8192));
	return out;
}

function gates(env: Env): GateConfig[] {
	const base = { address: env.IMPORT_ADDRESS, trustedAuthServ: list(env.TRUSTED_AUTHSERV) };
	return [
		{ ...base, senders: list(env.ALLOWED_SENDERS), domain: env.SENDER_DOMAIN },
		{ ...base, senders: [GMAIL_CONFIRM], domain: 'google.com' }
	];
}

export async function receive(
	msg: { from: string; to: string; rawSize: number; raw: ReadableStream<Uint8Array> },
	env: Env,
	now = Date.now()
): Promise<{ kept: boolean; reason?: string }> {
	const id = crypto.randomUUID();
	const refuse = async (
		reason: string,
		sender: string | null,
		subject: string | null,
		auth = ''
	) => {
		await env.DB.prepare(
			`INSERT INTO messages (id, received_at, sender, subject, status, reason, auth)
			 VALUES (?, ?, ?, ?, 'rejected', ?, ?)`
		)
			.bind(id, now, sender, subject?.slice(0, 300) ?? null, reason, auth.slice(0, 4000))
			.run();
		return { kept: false, reason };
	};
	if (!env.IMPORT_ADDRESS || !env.APP_TOKEN) return refuse('The Worker is not set up', null, null);
	if (msg.rawSize > MAX_BYTES) return refuse('Too big', msg.from, null);
	const forwarder = env.FORWARDED_BY?.trim().toLowerCase();
	if (forwarder && !msg.from.toLowerCase().includes(forwarder))
		return refuse(`Not forwarded by the expected account (${msg.from})`, msg.from, null);

	const raw = binary(new Uint8Array(await new Response(msg.raw).arrayBuffer()));
	const mail = parseMail(raw);
	const auth = mail.headers
		.filter((h) => h.name === 'authentication-results' || h.name === 'arc-authentication-results')
		.map((h) => h.value)
		.join('\n');
	const results = gates(env).map((g) => checkMail({ rcptTo: msg.to, headers: mail.headers }, g));
	if (!results.some((r) => r.ok)) {
		const first = results[0];
		return refuse(first.ok ? 'Refused' : first.reason, mail.from, mail.subject, auth);
	}

	const parsed = parseBetashares({ subject: mail.subject, text: mail.text });
	await env.DB.prepare(
		`INSERT OR IGNORE INTO messages
		 (id, message_id, received_at, sender, subject, raw, parsed, parser_version, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`
	)
		.bind(
			id,
			mail.header('message-id'),
			now,
			mail.from,
			mail.subject.slice(0, 300),
			raw,
			JSON.stringify(parsed),
			PARSER_VERSION
		)
		.run();
	return { kept: true };
}

function same(a: string, b: string): boolean {
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});

export async function api(req: Request, env: Env, now = Date.now()): Promise<Response> {
	const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	if (!env.APP_TOKEN || !same(token, env.APP_TOKEN)) return json({ error: 'unauthorised' }, 401);
	const url = new URL(req.url);

	if (req.method === 'GET' && url.pathname === '/status') {
		const counts = await env.DB.prepare(
			`SELECT status, COUNT(*) AS n, MAX(received_at) AS last FROM messages GROUP BY status`
		).all<{ status: string; n: number; last: number }>();
		const refused = await env.DB.prepare(
			`SELECT received_at AS at, sender, subject, reason FROM messages
			 WHERE status = 'rejected' ORDER BY received_at DESC LIMIT 10`
		).all();
		const by = Object.fromEntries(counts.results.map((r) => [r.status, r]));
		return json({
			pending: by.new?.n ?? 0,
			collected: by.collected?.n ?? 0,
			rejected: by.rejected?.n ?? 0,
			lastKeptAt: Math.max(by.new?.last ?? 0, by.collected?.last ?? 0) || null,
			refused: refused.results,
			now
		});
	}

	if (req.method === 'GET' && url.pathname === '/messages') {
		const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
		const rows = await env.DB.prepare(
			`SELECT id, received_at AS receivedAt, sender, subject, raw, parsed, parser_version AS parserVersion
			 FROM messages WHERE status = 'new' ORDER BY received_at LIMIT ?`
		)
			.bind(limit)
			.all();
		return json({ messages: rows.results });
	}

	if (req.method === 'POST' && url.pathname === '/ack') {
		const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
		const ids = Array.isArray(body?.ids)
			? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 100)
			: [];
		if (ids.length)
			await env.DB.batch(
				ids.map((i) =>
					env.DB.prepare(
						`UPDATE messages SET status = 'collected', collected_at = ? WHERE id = ? AND status = 'new'`
					).bind(now, i)
				)
			);
		return json({ acked: ids.length });
	}

	return json({ error: 'not found' }, 404);
}

/** Collected and refused mail goes after KEEP_DAYS; uncollected mail stays until the app takes it. */
export async function purge(env: Env, now = Date.now()) {
	const cutoff = now - Number(env.KEEP_DAYS || 30) * 86_400_000;
	await env.DB.prepare(
		`DELETE FROM messages WHERE status IN ('collected', 'rejected') AND received_at < ?`
	)
		.bind(cutoff)
		.run();
}

export default {
	async email(message: ForwardableEmailMessage, env: Env) {
		await receive(message, env);
	},
	fetch: (req: Request, env: Env) => api(req, env),
	async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(purge(env));
	}
};
