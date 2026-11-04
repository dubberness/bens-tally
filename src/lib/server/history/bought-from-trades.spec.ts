import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Breakdown } from './breakdown';
import { boughtFromTrades, firstTradeDate } from './bought-from-trades';
import { BOUGHT_FIXUP_REASON, runFixups } from './fixups';
import { monthEdits } from './snapshots';

const now = new Date();

function breakdown(prevMonth: string | null, bought: number, source: Breakdown['boughtSource']) {
	const b: Breakdown = {
		prevMonth,
		cash: 100_00,
		bought,
		boughtSource: source,
		markets: 250_00,
		super: 40_00,
		debt: 30_00,
		estimates: 5_000_00,
		other: 0,
		total: 0,
		estimateItems: []
	};
	b.total = b.cash + b.bought + b.markets + b.super + b.debt + b.estimates + b.other;
	return b;
}

function lock(month: string, b: Breakdown | null, status = 'locked') {
	db.insert(schema.snapshots)
		.values({
			month,
			status,
			netWorthCents: 1_000_000_00,
			breakdown: b,
			origin: 'sheet',
			lockedAt: now,
			createdAt: now,
			updatedAt: now
		})
		.run();
}

const read = (month: string) =>
	db.select().from(schema.snapshots).where(eq(schema.snapshots.month, month)).get()!;
const parts = (b: Breakdown) =>
	b.cash + b.bought + b.markets + b.super + b.debt + b.estimates + b.other;

describe('Bought ETFs from trade dates', () => {
	// January is the first month on record; February comes before any trade.
	lock('2031-01', null);
	lock('2031-02', breakdown('2031-01', 900_00, 'sheet'));
	// March and April: the sheet put the March buy in April, and left March short.
	lock('2031-03', breakdown('2031-02', 200_00, 'sheet'));
	lock('2031-04', breakdown('2031-03', 700_00, 'sheet'));
	// May has no trades at all, and the sheet agrees.
	lock('2031-05', breakdown('2031-04', 0, 'sheet'));
	// June was made by the app, already from trades.
	lock('2031-06', breakdown('2031-05', 123_00, 'trades'));
	// July is still open.
	lock('2031-07', breakdown('2031-06', 50_00, 'sheet'), 'open');

	it('does nothing while there are no trades', () => {
		expect(firstTradeDate()).toBeNull();
		expect(boughtFromTrades('why')).toEqual([]);
		runFixups();
		expect((read('2031-03').breakdown as Breakdown).boughtSource).toBe('sheet');
		expect(monthEdits('2031-03')).toHaveLength(0);
	});

	const inst = db
		.insert(schema.instruments)
		.values({ ticker: 'TEST', createdAt: now, updatedAt: now })
		.returning()
		.get();
	const buy = (date: string, valueCents: number, feeCents = 0) =>
		db
			.insert(schema.trades)
			.values({
				instrumentId: inst.id,
				date,
				side: 'buy',
				unitsE6: 1_000_000,
				priceE4: valueCents * 100,
				valueCents,
				feeCents,
				source: 'manual',
				createdAt: now,
				updatedAt: now
			})
			.run();

	it('uses trade dates for months the trades cover, keeping every other figure', () => {
		buy('2031-03-05', 500_00, 10_00);
		buy('2031-04-02', 650_00);
		expect(firstTradeDate()).toBe('2031-03-05');
		const before = Object.fromEntries(
			['2031-02', '2031-03', '2031-04', '2031-05', '2031-06', '2031-07'].map((m) => [m, read(m)])
		);

		const changed = runFixupsTwice();
		expect(changed).toEqual([
			{ month: '2031-03', oldBought: 200_00, newBought: 510_00 },
			{ month: '2031-04', oldBought: 700_00, newBought: 650_00 }
		]);

		const mar = read('2031-03');
		const marB = mar.breakdown as Breakdown;
		expect(marB).toMatchObject({ bought: 510_00, boughtSource: 'trades', prevMonth: '2031-02' });
		// markets moves by what bought moved: 250 + (200 − 510)
		expect(marB.markets).toBe(250_00 - 310_00);
		const oldMar = before['2031-03'].breakdown as Breakdown;
		expect(marB).toMatchObject({
			cash: oldMar.cash,
			super: oldMar.super,
			debt: oldMar.debt,
			estimates: oldMar.estimates,
			total: oldMar.total
		});
		expect(parts(marB)).toBe(marB.total);
		expect(mar.netWorthCents).toBe(before['2031-03'].netWorthCents);

		const apr = read('2031-04').breakdown as Breakdown;
		expect(apr).toMatchObject({ bought: 650_00, boughtSource: 'trades', markets: 250_00 + 50_00 });
		expect(parts(apr)).toBe(apr.total);
	});

	function runFixupsTwice() {
		const first = boughtFromTrades(BOUGHT_FIXUP_REASON);
		// The second run finds nothing left to move and writes nothing more.
		expect(boughtFromTrades(BOUGHT_FIXUP_REASON)).toEqual([]);
		runFixups();
		return first;
	}

	it('leaves months before the first trade, months already on trades and open months alone', () => {
		expect(read('2031-02').breakdown).toEqual(breakdown('2031-01', 900_00, 'sheet'));
		expect(read('2031-06').breakdown).toEqual(breakdown('2031-05', 123_00, 'trades'));
		expect((read('2031-07').breakdown as Breakdown).boughtSource).toBe('sheet');
		expect(read('2031-01').breakdown).toBeNull();
	});

	it('switches a month whose figure did not change to trades without an edit', () => {
		const may = read('2031-05').breakdown as Breakdown;
		expect(may).toMatchObject({ bought: 0, boughtSource: 'trades' });
		expect(monthEdits('2031-05')).toHaveLength(0);
	});

	it('records one edit per changed month, and none again on a second run', () => {
		for (const [month, oldV, newV] of [
			['2031-03', 200_00, 510_00],
			['2031-04', 700_00, 650_00]
		] as const) {
			const edits = monthEdits(month);
			expect(edits).toHaveLength(1);
			expect(edits[0]).toMatchObject({
				entity: 'snapshot',
				field: 'bought',
				oldValue: String(oldV),
				newValue: String(newV),
				reason: 'Bought ETFs now from trade dates'
			});
		}
		expect(monthEdits('2031-02')).toHaveLength(0);
		expect(monthEdits('2031-06')).toHaveLength(0);
	});

	it('records nothing when no reason is given (the import)', () => {
		lock('2031-08', breakdown('2031-07', 10_00, 'sheet'));
		expect(boughtFromTrades()).toEqual([{ month: '2031-08', oldBought: 10_00, newBought: 0 }]);
		expect(monthEdits('2031-08')).toHaveLength(0);
	});
});
