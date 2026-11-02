import { describe, expect, it } from 'vitest';
import { computeBreakdown, mine, type BreakdownInput } from './breakdown';

const acct = (
	over: Partial<BreakdownInput> & Pick<BreakdownInput, 'kind' | 'side' | 'prev' | 'curr'>
) => ({ id: Math.floor(Math.random() * 1e9), name: over.kind, ...over }) as BreakdownInput;

describe('computeBreakdown', () => {
	it('splits a month into parts that add up to the net-worth change', () => {
		const accounts = [
			acct({ kind: 'cash', side: 'asset', prev: 1_000_00, curr: 1_250_00 }),
			acct({ kind: 'investment', side: 'asset', prev: 5_000_00, curr: 5_400_00 }),
			acct({ kind: 'super', side: 'asset', prev: 20_000_00, curr: 19_900_00 }),
			acct({ kind: 'property', side: 'asset', prev: 300_000_00, curr: 310_000_00 }),
			acct({ kind: 'loan', side: 'liability', prev: 150_000_00, curr: 149_500_00 }),
			acct({
				kind: 'loan',
				side: 'liability',
				tiedToProperty: true,
				prev: 30_000_00,
				curr: 31_000_00
			}),
			acct({ kind: 'loan', side: 'liability', reestimate: true, prev: 2_000_00, curr: 2_050_00 }),
			acct({ kind: 'other', side: 'asset', prev: null, curr: 75_00 })
		];
		const b = computeBreakdown(accounts, 300_00);
		expect(b.cash).toBe(250_00);
		expect(b.bought).toBe(300_00);
		expect(b.markets).toBe(100_00);
		expect(b.super).toBe(-100_00);
		expect(b.debt).toBe(500_00);
		expect(b.estimates).toBe(10_000_00 - 1_000_00 - 50_00);
		expect(b.other).toBe(75_00);
		const before = 1_000_00 + 5_000_00 + 20_000_00 + 300_000_00 - 150_000_00 - 30_000_00 - 2_000_00;
		const after =
			1_250_00 + 5_400_00 + 19_900_00 + 310_000_00 - 149_500_00 - 31_000_00 - 2_050_00 + 75_00;
		expect(b.total).toBe(after - before);
		expect(b.cash + b.bought + b.markets + b.super + b.debt + b.estimates + b.other).toBe(b.total);
		expect(mine(b)).toBe(b.total - b.estimates);
		expect(b.estimateItems).toHaveLength(3);
	});

	it('always adds up, whatever the numbers', () => {
		const kinds = ['cash', 'investment', 'super', 'property', 'loan', 'other'];
		for (let run = 0; run < 200; run++) {
			const accounts = Array.from({ length: 6 }, (_, i) => {
				const kind = kinds[(run + i) % kinds.length];
				const pick = () => (Math.random() < 0.15 ? null : Math.round(Math.random() * 1e7));
				return acct({
					kind,
					side: kind === 'loan' ? 'liability' : 'asset',
					tiedToProperty: kind === 'loan' && i % 2 === 0,
					reestimate: Math.random() < 0.1,
					prev: pick(),
					curr: pick()
				});
			});
			const b = computeBreakdown(accounts, Math.round(Math.random() * 1e6 - 2e5));
			expect(b.cash + b.bought + b.markets + b.super + b.debt + b.estimates + b.other).toBe(
				b.total
			);
		}
	});
});
