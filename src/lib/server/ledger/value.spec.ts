import { describe, expect, it } from 'vitest';
import { db, schema } from '../db';
import { accountValue } from './value';

const now = new Date();

describe('accountValue', () => {
	it('falls back to the latest balance on or before the date', () => {
		const acct = db
			.insert(schema.accounts)
			.values({
				name: 'Test home',
				kind: 'property',
				side: 'asset',
				source: 'manual',
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		db.insert(schema.balances)
			.values([
				{
					accountId: acct.id,
					date: '2025-01-31',
					valueCents: 100_00,
					source: 'manual',
					createdAt: now
				},
				{
					accountId: acct.id,
					date: '2025-03-31',
					valueCents: 300_00,
					source: 'manual',
					reestimate: true,
					createdAt: now
				}
			])
			.run();
		expect(accountValue(acct, '2025-02-15')).toEqual({
			valueCents: 100_00,
			asOf: '2025-01-31',
			badge: 'manual'
		});
		expect(accountValue(acct)).toEqual({
			valueCents: 300_00,
			asOf: '2025-03-31',
			badge: 'estimate'
		});
		expect(accountValue(acct, '2024-12-31')).toBeNull();
	});
});
