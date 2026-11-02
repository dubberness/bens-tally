/**
 * Decides whether the email Worker keeps a message. Pure: the Worker calls it with
 * the envelope recipient and the parsed headers. Nothing here names a person; the
 * address, senders, domain and trusted servers all come from the Worker's settings.
 */
import type { Header } from './mime';

export interface GateConfig {
	/** The one address mail is accepted for. */
	address: string;
	/** Original senders allowed (header From), lower case. */
	senders: string[];
	/** Domain whose DKIM or DMARC must pass, e.g. the sender's company domain. */
	domain: string;
	/** Mail servers whose Authentication-Results are believed (authserv-id). */
	trustedAuthServ: string[];
}

export type GateResult = { ok: true } | { ok: false; reason: string };

export interface AuthResult {
	authserv: string;
	method: string;
	result: string;
	/** The domain the result is about (header.d / header.i / header.from). */
	domain: string | null;
}

const inDomain = (d: string | null, domain: string) =>
	!!d && (d === domain || d.endsWith(`.${domain}`));

/** Splits Authentication-Results / ARC-Authentication-Results values into results. */
export function authResults(values: string[]): AuthResult[] {
	const out: AuthResult[] = [];
	for (const raw of values) {
		const v = raw.replace(/\([^)]*\)/g, ' ').replace(/^\s*i=\d+\s*;/, '');
		const [servPart, ...rest] = v.split(';');
		const authserv = servPart.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
		for (const r of rest) {
			const m = r.trim().match(/^([a-z-]+)\s*=\s*([a-z]+)/i);
			if (!m) continue;
			const props = r.toLowerCase();
			const d =
				props.match(/header\.d\s*=\s*([^\s;]+)/)?.[1] ??
				props.match(/header\.i\s*=\s*[^@\s;]*@([^\s;]+)/)?.[1] ??
				props.match(/header\.from\s*=\s*([^\s;]+)/)?.[1] ??
				null;
			out.push({
				authserv,
				method: m[1].toLowerCase(),
				result: m[2].toLowerCase(),
				domain: d ? d.replace(/^@/, '').replace(/[">]/g, '') : null
			});
		}
	}
	return out;
}

function fromAddress(headers: Header[]): string | null {
	const v = headers.find((h) => h.name === 'from')?.value;
	if (!v) return null;
	const m = v.match(/<([^>]+)>/) ?? v.match(/([^\s<>"]+@[^\s<>"]+)/);
	return m ? m[1].trim().toLowerCase() : null;
}

export function checkMail(
	input: { rcptTo: string; headers: Header[] },
	cfg: GateConfig
): GateResult {
	if (input.rcptTo.trim().toLowerCase() !== cfg.address.trim().toLowerCase())
		return { ok: false, reason: 'Not sent to the import address' };

	const from = fromAddress(input.headers);
	if (!from || !cfg.senders.map((s) => s.toLowerCase()).includes(from))
		return { ok: false, reason: `Sender ${from ?? '(none)'} isn't allowed` };

	// Only the topmost result from a trusted server counts. Servers add theirs above the
	// message, so anything lower down could have been written by whoever sent it.
	const servers = cfg.trustedAuthServ.map((s) => s.toLowerCase());
	const top = input.headers
		.filter((h) => h.name === 'authentication-results' || h.name === 'arc-authentication-results')
		.map((h) => authResults([h.value]))
		.find((rs) => rs.length && servers.includes(rs[0].authserv));
	const trusted = top ?? [];
	const domain = cfg.domain.toLowerCase();
	if (
		trusted.some((r) => r.method === 'dmarc' && r.result === 'fail' && inDomain(r.domain, domain))
	)
		return { ok: false, reason: `DMARC failed for ${domain}` };
	const pass = trusted.some(
		(r) =>
			(r.method === 'dkim' || r.method === 'dmarc') &&
			r.result === 'pass' &&
			inDomain(r.domain, domain)
	);
	if (!pass) return { ok: false, reason: `No passing DKIM or DMARC result for ${domain}` };
	return { ok: true };
}
