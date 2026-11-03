import { beforeEach, describe, expect, it } from 'vitest';
import { createRule } from './engine';
import { merchantGaps } from './merchants';
import { setLineMerchant, updateLine } from './editor';
import { makeLine, makeTx, resetBudget } from './testing';

const asOf = '2026-11-03';

function setup() {
	const line = makeLine('Internet', 'bills', 9000);
	createRule({
		name: 'Internet',
		enabled: true,
		match: { merchant: 'Oldnet' },
		action: 'budget',
		budgetLineId: line.id,
		label: null
	});
	makeTx('Coffee Cart', -500, '2026-11-02'); // the sync is up to date
	for (const m of ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'])
		makeTx('Oldnet', -9000, `${m}-27`, { category: 'internet' });
	return line;
}

describe('merchant gaps', () => {
	beforeEach(resetBudget);

	it('finds a rule that went quiet while a new merchant took its place', () => {
		setup();
		makeTx('Newnet', -10900, '2026-10-13', { category: 'internet' });
		makeTx('Newnet', -10900, '2026-09-13', { category: 'internet' });
		const gaps = merchantGaps(asOf);
		expect(gaps).toHaveLength(1);
		expect(gaps[0]).toMatchObject({ lineName: 'Internet', lastHit: '2026-07-27', recurring: true });
		expect(gaps[0].candidate).toMatchObject({ merchant: 'Newnet', category: 'internet', count: 2 });
	});

	it('clears once the merchant is edited to the new one', () => {
		const line = setup();
		makeTx('Newnet', -10900, '2026-10-13', { category: 'internet' });
		expect(merchantGaps(asOf)).toHaveLength(1);
		setLineMerchant(line.id, 'Internet', 'Newnet');
		expect(merchantGaps(asOf)).toHaveLength(0);
	});

	it('stays quiet when nothing is recent at all (the sync is behind)', () => {
		setup();
		expect(merchantGaps('2027-03-03')).toHaveLength(0); // months later, with no new data
	});

	it('does not fire for a merchant that is still showing up', () => {
		setup();
		makeTx('Oldnet', -9000, '2026-10-27', { category: 'internet' });
		expect(merchantGaps(asOf)).toHaveLength(0);
	});

	it('ignores a new merchant another rule already sorted', () => {
		setup();
		const other = makeLine('Other');
		createRule({
			name: 'Newnet elsewhere',
			enabled: true,
			match: { merchant: 'Newnet' },
			action: 'budget',
			budgetLineId: other.id,
			label: null
		});
		makeTx('Newnet', -10900, '2026-10-13', { category: 'internet' });
		expect(merchantGaps(asOf)[0].candidate).toBeNull();
	});

	it('ignores lines that have ended', () => {
		const line = setup();
		updateLine(
			line.id,
			{
				name: 'Internet',
				group: 'bills',
				saverAccountId: null,
				startMonth: null,
				endMonth: '2026-08',
				note: null
			},
			null,
			'Oldnet'
		);
		makeTx('Newnet', -10900, '2026-10-13', { category: 'internet' });
		expect(merchantGaps(asOf)).toHaveLength(0);
	});
});
