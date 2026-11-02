import { describe, expect, it } from 'vitest';
import { matchTrade, type IncomingTrade, type KnownTrade } from './match';

const known = (over: Partial<KnownTrade>): KnownTrade => ({
	id: 1,
	orderId: null,
	ticker: 'VAS',
	date: '2026-03-02',
	side: 'buy',
	unitsE6: 10_123_400,
	priceE4: 1_000_000,
	valueCents: 101_234,
	feeCents: 0,
	...over
});
const row = (over: Partial<IncomingTrade>): IncomingTrade => ({
	orderId: 'ORD1',
	ticker: 'VAS',
	date: '2026-03-02',
	side: 'buy',
	unitsE6: 10_123_400,
	priceE4: 1_000_000,
	valueCents: 101_234,
	feeCents: 0,
	...over
});

describe('matching an incoming trade', () => {
	it('is the same trade when the order ID matches and the numbers agree', () => {
		expect(matchTrade(row({}), [known({ orderId: 'ORD1' })])).toEqual({ kind: 'same', id: 1 });
	});

	it('asks when the order ID matches but the numbers differ', () => {
		const m = matchTrade(row({ valueCents: 101_300 }), [known({ orderId: 'ORD1' })]);
		expect(m).toEqual({ kind: 'differs', id: 1, fields: ['value'] });
	});

	it('links a sheet trade with no order ID on the same day, units and value', () => {
		// Six-place units from the file against the sheet's four.
		const m = matchTrade(row({ unitsE6: 10_123_437, valueCents: 101_236 }), [known({})]);
		expect(m).toEqual({ kind: 'link', id: 1 });
	});

	it('asks when the dates are a day apart', () => {
		const m = matchTrade(row({ date: '2026-03-03' }), [known({})]);
		expect(m).toEqual({ kind: 'differs', id: 1, fields: ['date'] });
	});

	it('is new when nothing is close', () => {
		expect(matchTrade(row({ unitsE6: 5e6 }), [known({})]).kind).toBe('new');
		expect(matchTrade(row({ side: 'sell' }), [known({})]).kind).toBe('new');
		expect(matchTrade(row({ date: '2026-04-02' }), [known({})]).kind).toBe('new');
		// A trade that already has a different order ID is a different trade.
		expect(matchTrade(row({}), [known({ orderId: 'ORD9' })]).kind).toBe('new');
	});

	it('uses each known trade once, so two identical buys stay two', () => {
		const list = [known({ id: 1 }), known({ id: 2 })];
		const taken = new Set<number>();
		const a = matchTrade(row({ orderId: 'A' }), list, taken);
		if (a.kind !== 'new') taken.add(a.id);
		const b = matchTrade(row({ orderId: 'B' }), list, taken);
		expect([a, b]).toEqual([
			{ kind: 'link', id: 1 },
			{ kind: 'link', id: 2 }
		]);
		if (b.kind !== 'new') taken.add(b.id);
		expect(matchTrade(row({ orderId: 'C' }), list, taken).kind).toBe('new');
	});
});

describe('price rounding', () => {
	it('ignores a cent-rounded price against a four-place average', () => {
		const m = matchTrade(row({ orderId: 'X', priceE4: 1_000_123 }), [known({})]);
		expect(m.kind).toBe('link');
	});
	it('flags a price that is really different', () => {
		const m = matchTrade(row({ orderId: 'X', priceE4: 1_050_000 }), [known({})]);
		expect(m).toEqual({ kind: 'differs', id: 1, fields: ['price'] });
	});
});
