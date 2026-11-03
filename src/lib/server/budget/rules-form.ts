import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { parseMoney } from '$lib/money';
import { cleanMatch, isEmptyMatch, type RuleMatch } from '$lib/budget/rules';
import { isAction, type RuleInput } from './engine';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Dollar amount typed in a form, or null when empty; a string when it isn't money. */
function dollars(f: FormData, k: string): number | null | string {
	const raw = str(f, k);
	if (!raw) return null;
	const c = parseMoney(raw);
	return c == null || c < 0 ? 'Amounts should be plain dollars, like 50 or 12.50' : c;
}

/** Reads the rule form (create, edit, test). Returns the rule or a message about what is wrong. */
export function readRuleForm(f: FormData): RuleInput | string {
	const action = str(f, 'action');
	if (!isAction(action)) return 'Pick what the rule does';
	const min = dollars(f, 'min');
	const max = dollars(f, 'max');
	if (typeof min === 'string') return min;
	if (typeof max === 'string') return max;
	if (min != null && max != null && min > max)
		return 'The smallest amount is more than the largest';
	const account = Number(str(f, 'accountId'));
	const direction = str(f, 'direction');
	const match: RuleMatch = cleanMatch({
		merchant: str(f, 'merchant'),
		description: str(f, 'description'),
		category: str(f, 'category'),
		accountId: account > 0 ? account : undefined,
		tag: str(f, 'tag'),
		direction: direction === 'out' || direction === 'in' ? direction : undefined,
		minCents: min ?? undefined,
		maxCents: max ?? undefined
	});
	if (isEmptyMatch(match)) return 'Say what to look for: a merchant, some text, a category…';
	const lineId = Number(str(f, 'budgetLineId'));
	if (action === 'budget' && !(lineId > 0)) return 'Pick the budget line this counts toward';
	const label = str(f, 'label');
	if (action === 'other_person' && !label) return 'Say whose it is, like “Dad”';
	const name = str(f, 'name') || match.merchant || match.description || match.category || 'Rule';
	return {
		name,
		enabled: f.get('enabled') !== null || !f.has('shown'),
		match,
		action,
		budgetLineId: lineId > 0 && action !== 'transfer' && action !== 'income' ? lineId : null,
		label: action === 'other_person' ? label : null
	};
}

/** Names already used for "paid for someone else", for the label suggestions. */
export function knownLabels(): string[] {
	const fromRules = db
		.select({ l: schema.rules.label })
		.from(schema.rules)
		.where(and(eq(schema.rules.action, 'other_person'), isNotNull(schema.rules.label)))
		.all();
	const fromAssignments = db
		.select({ l: schema.assignments.note })
		.from(schema.assignments)
		.where(and(eq(schema.assignments.action, 'other_person'), isNotNull(schema.assignments.note)))
		.groupBy(schema.assignments.note)
		.all();
	return [
		...new Set([...fromRules, ...fromAssignments].map((r) => r.l!.trim()).filter(Boolean))
	].sort();
}

/** How many transactions each rule currently sorts. */
export function ruleCounts(): Map<number, number> {
	return new Map(
		db
			.select({ id: schema.assignments.ruleId, n: sql<number>`count(*)` })
			.from(schema.assignments)
			.where(isNotNull(schema.assignments.ruleId))
			.groupBy(schema.assignments.ruleId)
			.all()
			.map((r) => [r.id!, r.n])
	);
}
