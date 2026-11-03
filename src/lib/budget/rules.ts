/**
 * Matching rules, shared by the server (applying them) and the browser (describing them).
 * Nothing here knows any merchant: every rule is data Ben makes in the app.
 */

export const ACTIONS = [
	'budget',
	'other_person',
	'transfer',
	'income',
	'one_off',
	'investing',
	'repayment'
] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
	budget: 'Budget line',
	other_person: 'Paid for someone else',
	transfer: 'Own transfer (ignore)',
	income: 'Income',
	one_off: 'One-off',
	investing: 'Investing',
	repayment: 'Loan or mortgage repayment'
};

/** Every field is optional; a rule matches when all the fields it sets match. */
export interface RuleMatch {
	/** Contains, case-insensitive, on the merchant (Up's description). Commas mean "any of". */
	merchant?: string;
	/** Contains, case-insensitive, on the description, raw text or message. Commas mean "any of". */
	description?: string;
	/** Up category or parent category slug. Commas mean "any of". */
	category?: string;
	accountId?: number;
	/** Up tag, case-insensitive. */
	tag?: string;
	/** Money out or in; amounts below are compared without the sign. */
	direction?: 'out' | 'in';
	minCents?: number;
	maxCents?: number;
}

export interface MatchableTx {
	description: string;
	rawText?: string | null;
	message?: string | null;
	amountCents: number;
	category?: string | null;
	parentCategory?: string | null;
	tags?: string[] | null;
	accountId?: number | null;
}

export interface RuleLike {
	id: number;
	enabled: boolean;
	match: RuleMatch;
	action: string;
	budgetLineId: number | null;
	label?: string | null;
}

const terms = (s: string | undefined) =>
	(s ?? '')
		.split(',')
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);

/** Drops empty fields so a stored rule only holds what it matches on. */
export function cleanMatch(m: RuleMatch): RuleMatch {
	const out: RuleMatch = {};
	if (terms(m.merchant).length) out.merchant = m.merchant!.trim();
	if (terms(m.description).length) out.description = m.description!.trim();
	if (terms(m.category).length) out.category = m.category!.trim();
	if (m.accountId != null && Number.isFinite(m.accountId)) out.accountId = m.accountId;
	if (m.tag?.trim()) out.tag = m.tag.trim();
	if (m.direction === 'out' || m.direction === 'in') out.direction = m.direction;
	if (m.minCents != null && Number.isFinite(m.minCents)) out.minCents = m.minCents;
	if (m.maxCents != null && Number.isFinite(m.maxCents)) out.maxCents = m.maxCents;
	return out;
}

export function isEmptyMatch(m: RuleMatch): boolean {
	return Object.keys(cleanMatch(m)).length === 0;
}

export function matches(m: RuleMatch, tx: MatchableTx): boolean {
	if (isEmptyMatch(m)) return false;
	const merchant = terms(m.merchant);
	if (merchant.length) {
		const d = tx.description.toLowerCase();
		if (!merchant.some((t) => d.includes(t))) return false;
	}
	const description = terms(m.description);
	if (description.length) {
		const text = [tx.description, tx.rawText, tx.message].filter(Boolean).join(' ').toLowerCase();
		if (!description.some((t) => text.includes(t))) return false;
	}
	const category = terms(m.category);
	if (category.length) {
		const c = [tx.category, tx.parentCategory].filter(Boolean).map((s) => s!.toLowerCase());
		if (!category.some((t) => c.includes(t))) return false;
	}
	if (m.accountId != null && tx.accountId !== m.accountId) return false;
	if (m.tag) {
		const want = m.tag.toLowerCase();
		if (!(tx.tags ?? []).some((t) => t.toLowerCase() === want)) return false;
	}
	if (m.direction === 'out' && tx.amountCents >= 0) return false;
	if (m.direction === 'in' && tx.amountCents <= 0) return false;
	const size = Math.abs(tx.amountCents);
	if (m.minCents != null && size < m.minCents) return false;
	if (m.maxCents != null && size > m.maxCents) return false;
	return true;
}

/** The first enabled rule (in the order given) that matches, or null. */
export function firstMatch<R extends RuleLike>(rules: R[], tx: MatchableTx): R | null {
	for (const r of rules) if (r.enabled && matches(r.match, tx)) return r;
	return null;
}

/** "Merchant has Acme Telco · money out · over $50" */
export function describeMatch(m: RuleMatch, accountName?: (id: number) => string): string {
	const parts: string[] = [];
	if (m.merchant) parts.push(`merchant has ${m.merchant}`);
	if (m.description) parts.push(`text has ${m.description}`);
	if (m.category) parts.push(`category ${m.category}`);
	if (m.accountId != null) parts.push(`account ${accountName?.(m.accountId) ?? m.accountId}`);
	if (m.tag) parts.push(`tag ${m.tag}`);
	if (m.direction) parts.push(m.direction === 'out' ? 'money out' : 'money in');
	const $ = (c: number) => `$${(c / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 })}`;
	if (m.minCents != null && m.maxCents != null) parts.push(`${$(m.minCents)}–${$(m.maxCents)}`);
	else if (m.minCents != null) parts.push(`at least ${$(m.minCents)}`);
	else if (m.maxCents != null) parts.push(`up to ${$(m.maxCents)}`);
	return parts.join(' · ') || 'matches nothing yet';
}
