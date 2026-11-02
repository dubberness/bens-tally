import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { applyCsv, previewCsv } from './csv-import';
import { inboxCount, inboxItems, resolveItem } from './inbox';
import { editsOf, findTrade } from './records';

const now = new Date();

describe('Betashares CSV import', () => {
	const fund = db
		.insert(schema.instruments)
		.values({ ticker: 'VAS', createdAt: now, updatedAt: now })
		.returning()
		.get();
	const sheetTrade = (date: string, units: number, price: number) =>
		db
			.insert(schema.trades)
			.values({
				instrumentId: fund.id,
				date,
				side: 'buy',
				unitsE6: Math.round(units * 1e6),
				priceE4: Math.round(price * 1e4),
				valueCents: Math.round(units * price * 100),
				source: 'sheet',
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
	const a = sheetTrade('2026-01-05', 10.5, 100);
	const b = sheetTrade('2026-02-05', 4, 101);

	const csv = [
		'Trade Date,Order ID,Code,Type,Quantity,Average Price,Value,Status',
		'05/01/2026,ab-1,VAS,Buy,10.500000,100.00,"1,050.00",Filled',
		'06/02/2026,ab-2,VAS,Buy,4,101.00,404.00,Filled',
		'10/03/2026,ab-3,NEWF,Buy,2,50,100.00,Filled',
		'11/03/2026,ab-4,VAS,Buy,1,100,100.00,Cancelled',
		'12/03/2026,ab-5,,Buy,1,100,100.00,Filled'
	].join('\n');

	it('previews what each row would do', () => {
		const p = previewCsv(csv);
		expect(p.mapping.orderId).toBe(1);
		expect(p.rows.map((r) => r.outcome)).toEqual(['link', 'differs', 'new']);
		expect(p.rows[1].fields).toEqual(['date']);
		expect(p.newFunds).toEqual(['NEWF']);
		expect(p.skipped).toBe(1);
		expect(p.problems).toHaveLength(1);
	});

	it('applies: links, adds, and sends the rest to the Inbox once', () => {
		const p = previewCsv(csv);
		const r = applyCsv(csv, p.mapping, 'trades.csv');
		expect(r).toMatchObject({ added: 1, linked: 1, review: 2, newFunds: ['NEWF'] });
		expect(findTrade(a.id)!.orderId).toBe('AB-1');
		expect(editsOf('trade', a.id)[0]).toMatchObject({ field: 'orderId', newValue: 'AB-1' });
		expect(inboxCount()).toBe(2);
		const again = applyCsv(csv, p.mapping, 'trades.csv');
		expect(again).toMatchObject({ added: 0, linked: 0, same: 2, review: 0, alreadyInInbox: 2 });
		expect(inboxCount()).toBe(2);
	});

	it("uses the file's figures when Ben says so, keeping a history", () => {
		const item = inboxItems().review.find(
			(i) => (i.result as { kind: string }).kind === 'differs'
		)!;
		expect(resolveItem(item.id, 'use-file')).toBeNull();
		const t = findTrade(b.id)!;
		expect(t.date).toBe('2026-02-06');
		expect(t.orderId).toBe('AB-2');
		expect(
			editsOf('trade', b.id)
				.map((e) => e.field)
				.sort()
		).toEqual(['date', 'orderId']);
		const after = db
			.select()
			.from(schema.importItems)
			.where(eq(schema.importItems.id, item.id))
			.get()!;
		expect(after.status).toBe('applied');
		expect(inboxCount()).toBe(1);
	});
});
