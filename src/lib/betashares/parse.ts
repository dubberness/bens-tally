/**
 * Reads Betashares Direct notification emails into records. Pure TypeScript with
 * no Node-only APIs: the Cloudflare Worker imports it as well as the app.
 *
 * Money is integer cents, units integer millionths (unitsE6), unit prices integer
 * ten-thousandths of a dollar (priceE4), dates 'YYYY-MM-DD' as printed in the email
 * (Betashares prints Sydney time, which is always the same date as Hobart).
 *
 * Anything that doesn't fit a known layout comes back as kind 'unknown' with a
 * reason, never guessed.
 */
import { parseMail } from './mime';

/** Bump when the parser's output changes, so stored records can be re-read. */
export const PARSER_VERSION = 1;

export interface ParsedTrade {
	kind: 'trade';
	orderId: string;
	ticker: string;
	fundName: string | null;
	side: 'buy' | 'sell';
	recurring: boolean;
	date: string;
	priceE4: number;
	unitsE6: number;
	valueCents: number;
	totalCents: number;
	feeCents: number;
}

export interface ParsedIncomeLine {
	ticker: string;
	perUnitE6: number | null;
	unitsE6: number | null;
	amountCents: number;
	reinvested: boolean;
}

export interface ParsedIncome {
	kind: 'income';
	date: string;
	totalCents: number;
	lines: ParsedIncomeLine[];
}

export interface ParsedIgnored {
	kind: 'ignored';
	reason: string;
}

export interface ParsedUnknown {
	kind: 'unknown';
	reason: string;
}

export type ParsedEmail = ParsedTrade | ParsedIncome | ParsedIgnored | ParsedUnknown;

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string | null {
	if (!(y > 1990 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
	const dt = new Date(Date.UTC(y, m - 1, d));
	if (dt.getUTCMonth() !== m - 1) return null;
	return `${y}-${pad(m)}-${pad(d)}`;
}

/** '1,234.5678' → 1234.5678, or null. */
function num(s: string | undefined): number | null {
	if (s == null) return null;
	const n = Number(s.replace(/[,\s$]/g, ''));
	return Number.isFinite(n) ? n : null;
}

/** Decimal string → integer scaled by 10^places, without float drift. */
export function scaled(s: string, places: number): number | null {
	const clean = s.replace(/[,\s$]/g, '');
	const m = clean.match(/^(-?)(\d*)(?:\.(\d*))?$/);
	if (!m || (m[2] === '' && !m[3])) return null;
	const frac = (m[3] ?? '').padEnd(places + 1, '0');
	let whole = Number(m[2] || '0') * 10 ** places + Number(frac.slice(0, places) || '0');
	if (Number(frac[places]) >= 5) whole += 1; // round half up on the next digit
	return m[1] ? -whole : whole;
}

const SUBJECT_PREFIX = /^\s*((fwd?|fw|re)\s*:\s*)+/i;

const IGNORED: [RegExp, string][] = [
	[/auto-?invest is coming up/i, 'Auto-invest reminder'],
	[/cash deposit/i, 'Cash deposit'],
	[/withdrawal/i, 'Cash withdrawal'],
	[/statement is (now )?available/i, 'Statement'],
	[/new login|log ?in detected|sign[- ]?in/i, 'Login notice'],
	[/bank account has (successfully )?been linked/i, 'Bank account linked'],
	[/password|verify|verification|one-time code/i, 'Account security'],
	[/newsletter|webinar|market update|insights|update on|introducing/i, 'Newsletter']
];

function flat(text: string): string {
	return text
		.replace(/\(\s*https?:\/\/[^)]*\)/g, ' ') // link targets in the text part
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseTrade(subject: string, text: string): ParsedTrade | ParsedUnknown {
	const sm = subject.match(/your (recurring|buy|sell) order for ([A-Z0-9.]{2,8}) has been filled/i);
	if (!sm) return { kind: 'unknown', reason: 'Order email in an unknown layout' };
	const ticker = sm[2].toUpperCase();
	const body = flat(text);
	const missing: string[] = [];

	const orderId = body.match(/Order ID:?\s*([A-Za-z0-9-]{6,})/i)?.[1] ?? null;
	if (!orderId) missing.push('order ID');

	const bodySide = body.match(/Your (buy|sell) order has been filled/i)?.[1]?.toLowerCase();
	const side = (bodySide ??
		(sm[1].toLowerCase() === 'sell' ? 'sell' : sm[1].toLowerCase() === 'buy' ? 'buy' : null)) as
		'buy' | 'sell' | null;
	if (!side) missing.push('buy or sell');

	const dm = body.match(
		/filled (?:at|on)\s+(?:[A-Za-z]+day,?\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*\((AEDT|AEST|Sydney time)\)/i
	);
	const date = dm
		? ymd(Number(dm[3]), MONTHS.indexOf(dm[2].toLowerCase()) + 1, Number(dm[1]))
		: null;
	if (!date) missing.push('fill date');

	const price = body.match(/Average price\s*\$\s*([\d,]+(?:\.\d+)?)/i)?.[1];
	const qty = body.match(/Quantity\s*([\d,]+(?:\.\d+)?)/i)?.[1];
	const value = body.match(/\bValue\s*\$\s*([\d,]+(?:\.\d+)?)/)?.[1];
	const total = body.match(/\bTotal\s*\$\s*([\d,]+(?:\.\d+)?)/)?.[1];
	const priceE4 = price ? scaled(price, 4) : null;
	const unitsE6 = qty ? scaled(qty, 6) : null;
	const valueCents = value ? scaled(value, 2) : null;
	const totalCents = total ? scaled(total, 2) : valueCents;
	if (priceE4 == null) missing.push('average price');
	if (unitsE6 == null) missing.push('quantity');
	if (valueCents == null) missing.push('value');

	if (missing.length || !orderId || !side || !date) {
		return { kind: 'unknown', reason: `Couldn't read the ${missing.join(', ')}` };
	}

	const feeText = body.match(/\b(?:Brokerage|Fees?)\s*\$\s*([\d,]+(?:\.\d+)?)/i)?.[1];
	const feeCents = feeText
		? (scaled(feeText, 2) ?? 0)
		: Math.abs((totalCents ?? valueCents!) - valueCents!);

	// Units × price should come close to the value (price is rounded to cents).
	const implied = (unitsE6! / 1e6) * (priceE4! / 1e4) * 100;
	if (Math.abs(implied - valueCents!) > Math.max(10, valueCents! * 0.005)) {
		return {
			kind: 'unknown',
			reason: `Quantity × price ($${(implied / 100).toFixed(2)}) doesn't match the value ($${(valueCents! / 100).toFixed(2)})`
		};
	}

	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	let fundName: string | null = null;
	const filledAt = lines.findIndex((l) => /filled (at|on)/i.test(l));
	const idLine = lines.findIndex((l) => /Order ID/i.test(l));
	if (idLine >= 0 && filledAt > idLine) {
		for (const l of lines.slice(idLine + 1, filledAt)) {
			if (l.toUpperCase() === ticker || /\blogo$/i.test(l)) continue;
			if (/^[\s|]*$/.test(l)) continue;
			fundName = l.replace(/^\|\s*/, '').trim() || null;
			break;
		}
	}

	return {
		kind: 'trade',
		orderId: orderId.toUpperCase(),
		ticker,
		fundName,
		side,
		recurring: /recurring order/i.test(subject) || /recurring order filled/i.test(body),
		date,
		priceE4: priceE4!,
		unitsE6: unitsE6!,
		valueCents: valueCents!,
		totalCents: totalCents ?? valueCents!,
		feeCents
	};
}

function parseIncome(subject: string, text: string): ParsedIncome | ParsedUnknown {
	const total = subject.match(/received income of \$\s*([\d,]+(?:\.\d+)?)/i)?.[1];
	const totalCents = total ? scaled(total, 2) : null;
	const body = flat(text);
	const dm = body.match(/distributions? paid on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
	const date = dm ? ymd(Number(dm[3]), Number(dm[2]), Number(dm[1])) : null;
	if (!date) return { kind: 'unknown', reason: "Couldn't read the payment date" };

	const start = body.search(/Summary of distributions/i);
	const endRel = body.slice(Math.max(start, 0)).search(/Distribution Total/i);
	const section =
		start >= 0 && endRel >= 0 ? body.slice(start, start + endRel) : body.slice(Math.max(start, 0));

	// Where each "kept as cash" / "reinvested" heading starts.
	const heads: { at: number; reinvested: boolean }[] = [];
	for (const m of section.matchAll(/retained\s+as\s+cash|paid\s+(?:in|as)\s+cash/gi))
		heads.push({ at: m.index ?? 0, reinvested: false });
	for (const m of section.matchAll(
		/(?:will\s+be|to\s+be|been)\s+reinvested|reinvested\s+(?:in|into|as)\s+(?:units|additional)/gi
	))
		heads.push({ at: m.index ?? 0, reinvested: true });
	heads.sort((a, b) => a.at - b.at);

	const lines: ParsedIncomeLine[] = [];
	for (const m of section.matchAll(
		/\b([A-Z][A-Z0-9]{1,5})\s+\$\s*([\d,]*\.?\d+)\s+([\d,]*\.?\d+)\s+\$\s*([\d,]*\.?\d+)/g
	)) {
		const at = m.index ?? 0;
		const head = [...heads].reverse().find((h) => h.at < at);
		if (!head)
			return { kind: 'unknown', reason: `Couldn't tell if ${m[1]} was kept as cash or reinvested` };
		const amountCents = scaled(m[4], 2);
		if (amountCents == null) continue;
		lines.push({
			ticker: m[1],
			perUnitE6: scaled(m[2], 6),
			unitsE6: scaled(m[3], 6),
			amountCents,
			reinvested: head.reinvested
		});
	}
	if (!lines.length)
		return { kind: 'unknown', reason: "Couldn't find any holdings in the summary" };
	const sum = lines.reduce((s, l) => s + l.amountCents, 0);
	const expected =
		totalCents ?? scaled(body.match(/Distribution Total\s*\$\s*([\d,.]+)/i)?.[1] ?? '', 2);
	if (expected != null && Math.abs(sum - expected) > lines.length) {
		return {
			kind: 'unknown',
			reason: `The holdings add up to $${(sum / 100).toFixed(2)}, not $${(expected / 100).toFixed(2)}`
		};
	}
	return { kind: 'income', date, totalCents: expected ?? sum, lines };
}

/** Reads one email given its subject and plain text (or HTML turned into text). */
export function parseBetashares(input: { subject: string; text: string }): ParsedEmail {
	const subject = input.subject.replace(SUBJECT_PREFIX, '').trim();
	if (/order for .+ has been filled/i.test(subject)) return parseTrade(subject, input.text);
	if (/received income of/i.test(subject)) return parseIncome(subject, input.text);
	for (const [re, reason] of IGNORED) if (re.test(subject)) return { kind: 'ignored', reason };
	if (/order for .+ (cancelled|canceled|expired|rejected|placed)/i.test(subject))
		return { kind: 'ignored', reason: 'Order not filled' };
	return { kind: 'unknown', reason: 'Not a layout the app knows' };
}

/** Reads a whole raw email (RFC 822 text). */
export function parseBetasharesRaw(raw: string): ParsedEmail & { subject: string } {
	const mail = parseMail(raw);
	return { ...parseBetashares({ subject: mail.subject, text: mail.text }), subject: mail.subject };
}

/** Plain-number helper for callers that hold dollar strings. */
export { num as parseNumber };
