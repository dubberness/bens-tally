/**
 * A small, dependency-free reader for RFC 822 / MIME email. Pure TypeScript with
 * only web-standard APIs (TextDecoder, atob), so the Cloudflare Worker and the app
 * both use it. It reads what Betashares sends: multipart/alternative with
 * quoted-printable or base64 text and HTML parts.
 */

export interface Header {
	/** Lower-case name. */
	name: string;
	value: string;
}

export interface ParsedMail {
	headers: Header[];
	/** First header with this name, or null. */
	header(name: string): string | null;
	/** Every header with this name, top to bottom. */
	headersAll(name: string): string[];
	subject: string;
	/** Address from the From header, lower case. */
	from: string | null;
	fromName: string | null;
	to: string | null;
	date: Date | null;
	/** The text/plain body, or the HTML body turned into text. */
	text: string;
	html: string | null;
}

interface Part {
	headers: Header[];
	body: string;
}

function splitHeadBody(raw: string): { head: string; body: string } {
	const m = raw.match(/\r?\n\r?\n/);
	if (!m || m.index === undefined) return { head: raw, body: '' };
	return { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}

export function parseHeaders(head: string): Header[] {
	const out: Header[] = [];
	for (const line of head.split(/\r?\n/)) {
		if (/^[ \t]/.test(line) && out.length) {
			out[out.length - 1].value += ' ' + line.trim();
			continue;
		}
		const i = line.indexOf(':');
		if (i <= 0) continue;
		out.push({ name: line.slice(0, i).trim().toLowerCase(), value: line.slice(i + 1).trim() });
	}
	return out;
}

function bytesFromBinary(s: string): Uint8Array {
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
	return out;
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
	try {
		return new TextDecoder(charset || 'utf-8').decode(bytes);
	} catch {
		return new TextDecoder('utf-8').decode(bytes);
	}
}

/** Quoted-printable → bytes. Characters above 0xFF (already-decoded UTF-8) pass through as UTF-8. */
function qpToBytes(s: string): Uint8Array {
	const body = s.replace(/=\r?\n/g, '');
	const out: number[] = [];
	const enc = new TextEncoder();
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(body.slice(i + 1, i + 3))) {
			out.push(parseInt(body.slice(i + 1, i + 3), 16));
			i += 2;
		} else {
			const code = ch.charCodeAt(0);
			if (code < 0x80) out.push(code);
			else out.push(...enc.encode(ch));
		}
	}
	return new Uint8Array(out);
}

function base64ToBytes(s: string): Uint8Array {
	const clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
	try {
		return bytesFromBinary(atob(clean));
	} catch {
		return new Uint8Array();
	}
}

/** Decodes =?charset?Q|B?...?= words in a header value. */
export function decodeWords(value: string): string {
	return value
		.replace(/\?=\s+=\?/g, '?==?')
		.replace(
			/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g,
			(_, charset: string, enc: string, text: string) => {
				const bytes =
					enc.toUpperCase() === 'B' ? base64ToBytes(text) : qpToBytes(text.replace(/_/g, ' '));
				return decodeBytes(bytes, charset.toLowerCase());
			}
		);
}

function param(value: string, name: string): string | null {
	const m = value.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, 'i'));
	return m ? (m[2] ?? m[1]) : null;
}

function getHeader(headers: Header[], name: string): string | null {
	return headers.find((h) => h.name === name)?.value ?? null;
}

function decodePartBody(part: Part): string {
	const type = getHeader(part.headers, 'content-type') ?? 'text/plain';
	const charset = (param(type, 'charset') ?? 'utf-8').toLowerCase();
	const cte = (getHeader(part.headers, 'content-transfer-encoding') ?? '7bit').toLowerCase();
	if (cte === 'base64') return decodeBytes(base64ToBytes(part.body), charset);
	if (cte === 'quoted-printable') return decodeBytes(qpToBytes(part.body), charset);
	return part.body;
}

/** Every leaf part, depth first. */
function leaves(part: Part, depth = 0): Part[] {
	const type = getHeader(part.headers, 'content-type') ?? 'text/plain';
	if (!/^multipart\//i.test(type) || depth > 8) return [part];
	const boundary = param(type, 'boundary');
	if (!boundary) return [part];
	const out: Part[] = [];
	const chunks = part.body.split(`--${boundary}`);
	for (const chunk of chunks.slice(1)) {
		if (chunk.startsWith('--')) break;
		const { head, body } = splitHeadBody(chunk.replace(/^\r?\n/, ''));
		out.push(...leaves({ headers: parseHeaders(head), body }, depth + 1));
	}
	return out;
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	copy: '©'
};

export function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
		if (e[0] === '#') {
			const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[e.toLowerCase()] ?? whole;
	});
}

/** Rough HTML → text, one block per line. Good enough for reading figures out of an email. */
export function htmlToText(html: string): string {
	const t = html
		.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|tr|td|th|h\d|li|table)>/gi, '\n')
		.replace(/<[^>]+>/g, '');
	return decodeEntities(t)
		.split('\n')
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
}

function address(value: string | null): { address: string | null; name: string | null } {
	if (!value) return { address: null, name: null };
	const decoded = decodeWords(value);
	const angle = decoded.match(/<([^>]+)>/);
	const addr = angle ? angle[1] : decoded.match(/[^\s<>"]+@[^\s<>"]+/)?.[0];
	const name = angle ? decoded.slice(0, angle.index).replace(/"/g, '').trim() || null : null;
	return { address: addr ? addr.trim().toLowerCase() : null, name };
}

export function parseMail(raw: string): ParsedMail {
	const { head, body } = splitHeadBody(raw);
	const headers = parseHeaders(head);
	const parts = leaves({ headers, body });
	const isType = (p: Part, t: string) =>
		(getHeader(p.headers, 'content-type') ?? 'text/plain').toLowerCase().startsWith(t) &&
		!/attachment/i.test(getHeader(p.headers, 'content-disposition') ?? '');
	const plain = parts.find((p) => isType(p, 'text/plain'));
	const htmlPart = parts.find((p) => isType(p, 'text/html'));
	const html = htmlPart ? decodePartBody(htmlPart) : null;
	const text = plain ? decodePartBody(plain) : html ? htmlToText(html) : '';
	const from = address(getHeader(headers, 'from'));
	const dateHeader = getHeader(headers, 'date');
	const date = dateHeader ? new Date(dateHeader) : null;
	return {
		headers,
		header: (name) => getHeader(headers, name.toLowerCase()),
		headersAll: (name) => headers.filter((h) => h.name === name.toLowerCase()).map((h) => h.value),
		subject: decodeWords(getHeader(headers, 'subject') ?? '').trim(),
		from: from.address,
		fromName: from.name,
		to: address(getHeader(headers, 'to')).address,
		date: date && !Number.isNaN(date.getTime()) ? date : null,
		text,
		html
	};
}
