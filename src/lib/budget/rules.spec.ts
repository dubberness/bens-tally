import { describe, expect, it } from 'vitest';
import { cleanMatch, describeMatch, firstMatch, matches, type MatchableTx } from './rules';

const tx = (over: Partial<MatchableTx> = {}): MatchableTx => ({
	description: 'Acme Telco',
	amountCents: -5000,
	category: 'internet',
	parentCategory: 'home',
	tags: ['bill'],
	accountId: 3,
	...over
});

describe('matches', () => {
	it('never matches an empty rule', () => {
		expect(matches({}, tx())).toBe(false);
		expect(matches(cleanMatch({ merchant: ' , ' }), tx())).toBe(false);
	});

	it('matches the merchant by contains, ignoring case, with commas meaning any of', () => {
		expect(matches({ merchant: 'acme' }, tx())).toBe(true);
		expect(matches({ merchant: 'other, TELCO' }, tx())).toBe(true);
		expect(matches({ merchant: 'other' }, tx())).toBe(false);
	});

	it('needs every field it sets to match', () => {
		const m = { merchant: 'acme', direction: 'out' as const, minCents: 1000, maxCents: 9000 };
		expect(matches(m, tx())).toBe(true);
		expect(matches(m, tx({ amountCents: -20000 }))).toBe(false);
		expect(matches(m, tx({ amountCents: 5000 }))).toBe(false);
		expect(matches({ ...m, minCents: undefined, maxCents: undefined, direction: 'in' }, tx())).toBe(
			false
		);
	});

	it('matches category, parent category, account, tag and free text', () => {
		expect(matches({ category: 'internet' }, tx())).toBe(true);
		expect(matches({ category: 'home' }, tx())).toBe(true);
		expect(matches({ category: 'groceries' }, tx())).toBe(false);
		expect(matches({ accountId: 3 }, tx())).toBe(true);
		expect(matches({ accountId: 4 }, tx())).toBe(false);
		expect(matches({ tag: 'BILL' }, tx())).toBe(true);
		expect(matches({ description: 'ref 99' }, tx({ message: 'Ref 99 thanks' }))).toBe(true);
	});
});

describe('firstMatch', () => {
	const rule = (id: number, merchant: string, enabled = true) => ({
		id,
		enabled,
		match: { merchant },
		action: 'budget',
		budgetLineId: id
	});

	it('takes the first enabled rule that matches, in order', () => {
		const rules = [rule(1, 'zzz'), rule(2, 'acme', false), rule(3, 'acme'), rule(4, 'telco')];
		expect(firstMatch(rules, tx())?.id).toBe(3);
		expect(firstMatch([rule(1, 'zzz')], tx())).toBeNull();
	});
});

describe('describeMatch', () => {
	it('reads back what a rule looks for', () => {
		expect(describeMatch({ merchant: 'Acme', direction: 'out', minCents: 5000 })).toBe(
			'merchant has Acme · money out · at least $50'
		);
		expect(describeMatch({})).toBe('matches nothing yet');
	});
});
