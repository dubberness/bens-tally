import { and, desc, eq, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { parsePriceE4 } from './instruments-admin';

/*
 * Trades and distributions as Ben edits them. Every change to an existing record is
 * kept in the edits table (old and new value per field, with an optional reason), so a
 * figure that moved can always be traced back.
 */

export type Trade = typeof schema.trades.$inferSelect;
export type Distribution = typeof schema.distributions.$inferSelect;

export interface TradeInput {
	instrumentId: number;
	date: string;
	side: 'buy' | 'sell';
	unitsE6: number;
	priceE4: number;
	valueCents: number;
	feeCents: number;
	orderId: string | null;
	note: string | null;
}

export interface DistributionInput {
	instrumentId: number;
	date: string;
	unitsE6: number | null;
	perUnitE6: number | null;
	amountCents: number;
	frankingCents: number | null;
	reinvested: boolean;
	note: string | null;
}

/** '1,234.5' → 123450 cents; blank → null. */
export function parseCents(s: string): number | null | 'bad' {
	const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 'bad';
}

/** Units to millionths; blank → null. */
export function parseUnitsE6(s: string): number | null | 'bad' {
	const t = s.trim().replace(/,/g, '');
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) : 'bad';
}

const field = (f: FormData, k: string) => String(f.get(k) ?? '');
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Reads the trade form. Value is worked out from units × price when left blank. */
export function readTradeForm(f: FormData): TradeInput | string {
	const instrumentId = Number(f.get('instrumentId'));
	if (!instrumentId) return 'Pick the fund.';
	const date = field(f, 'date');
	if (!isDate(date)) return 'Enter the date.';
	const side = field(f, 'side');
	if (side !== 'buy' && side !== 'sell') return 'Pick buy or sell.';
	const units = parseUnitsE6(field(f, 'units'));
	if (units == null || units === 'bad') return 'Units must be a positive number.';
	const price = parsePriceE4(field(f, 'price'));
	const value = parseCents(field(f, 'value'));
	if (price === 'bad') return 'Price must be a positive number.';
	if (value === 'bad') return 'Value must be a number.';
	if (price == null && value == null) return 'Enter the price or the value.';
	const fee = parseCents(field(f, 'fee'));
	if (fee === 'bad') return 'Fee must be a number.';
	const valueCents = value ?? Math.round((units * price!) / 1e8);
	const priceE4 = price ?? Math.round((valueCents * 1e8) / units);
	return {
		instrumentId,
		date,
		side,
		unitsE6: units,
		priceE4,
		valueCents,
		feeCents: fee ?? 0,
		orderId: field(f, 'orderId').trim().toUpperCase() || null,
		note: field(f, 'note').trim() || null
	};
}

/** Reads the distribution form. Amount is per unit × units when left blank. */
export function readDistributionForm(f: FormData): DistributionInput | string {
	const instrumentId = Number(f.get('instrumentId'));
	if (!instrumentId) return 'Pick the fund.';
	const date = field(f, 'date');
	if (!isDate(date)) return 'Enter the payment date.';
	const units = parseUnitsE6(field(f, 'units'));
	if (units === 'bad') return 'Units must be a positive number.';
	const perUnitRaw = field(f, 'perUnit').trim().replace(/^\$/, '');
	const perUnit = perUnitRaw ? Number(perUnitRaw) : null;
	if (perUnit != null && !(Number.isFinite(perUnit) && perUnit >= 0))
		return 'Per unit must be a number.';
	const amount = parseCents(field(f, 'amount'));
	if (amount === 'bad') return 'Amount must be a number.';
	const perUnitE6 = perUnit == null ? null : Math.round(perUnit * 1e6);
	const amountCents =
		amount ?? (perUnitE6 != null && units ? Math.round((perUnitE6 * units) / 1e10) : null);
	if (amountCents == null) return 'Enter the amount, or per unit and units.';
	const franking = parseCents(field(f, 'franking'));
	if (franking === 'bad') return 'Franking credits must be a number.';
	return {
		instrumentId,
		date,
		unitsE6: units,
		perUnitE6: perUnitE6 ?? (units ? Math.round((amountCents * 1e10) / units) : null),
		amountCents,
		frankingCents: franking,
		reinvested: f.get('reinvested') === 'on' || f.get('reinvested') === 'true',
		note: field(f, 'note').trim() || null
	};
}

function recordEdits(
	entity: 'trade' | 'distribution',
	id: number,
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	reason: string | null
) {
	const at = new Date();
	for (const [k, v] of Object.entries(after)) {
		const old = before[k];
		if ((old ?? null) === (v ?? null)) continue;
		db.insert(schema.edits)
			.values({
				entity,
				entityKey: String(id),
				field: k,
				oldValue: old == null ? null : String(old),
				newValue: v == null ? null : String(v),
				reason,
				at
			})
			.run();
	}
}

const orderIdTaken = (orderId: string | null, exceptId?: number) =>
	!!orderId &&
	!!db
		.select({ id: schema.trades.id })
		.from(schema.trades)
		.where(
			exceptId == null
				? eq(schema.trades.orderId, orderId)
				: and(eq(schema.trades.orderId, orderId), ne(schema.trades.id, exceptId))
		)
		.get();

export const findTrade = (id: number) =>
	db.select().from(schema.trades).where(eq(schema.trades.id, id)).get();
export const findDistribution = (id: number) =>
	db.select().from(schema.distributions).where(eq(schema.distributions.id, id)).get();

export function addTrade(
	v: TradeInput,
	source: string,
	importItemId: number | null = null
): number | string {
	if (orderIdTaken(v.orderId)) return `Order ${v.orderId} is already recorded.`;
	const now = new Date();
	return db
		.insert(schema.trades)
		.values({ ...v, source, importItemId, createdAt: now, updatedAt: now })
		.returning({ id: schema.trades.id })
		.get().id;
}

export function updateTrade(
	id: number,
	v: Partial<TradeInput>,
	reason: string | null
): string | null {
	const before = findTrade(id);
	if (!before) return 'That trade is gone.';
	if (v.orderId !== undefined && orderIdTaken(v.orderId, id))
		return `Order ${v.orderId} is already on another trade.`;
	recordEdits('trade', id, before, v, reason);
	db.update(schema.trades)
		.set({ ...v, updatedAt: new Date() })
		.where(eq(schema.trades.id, id))
		.run();
	return null;
}

/** Deleting keeps a record of what it was, so the history page can still say. */
export function deleteTrade(id: number, reason: string | null) {
	const before = findTrade(id);
	if (!before) return;
	db.insert(schema.edits)
		.values({
			entity: 'trade',
			entityKey: String(id),
			field: 'deleted',
			oldValue: JSON.stringify(before),
			newValue: null,
			reason,
			at: new Date()
		})
		.run();
	db.delete(schema.trades).where(eq(schema.trades.id, id)).run();
}

const distributionTaken = (instrumentId: number, date: string, exceptId?: number) =>
	!!db
		.select({ id: schema.distributions.id })
		.from(schema.distributions)
		.where(
			and(
				eq(schema.distributions.instrumentId, instrumentId),
				eq(schema.distributions.date, date),
				exceptId == null ? undefined : ne(schema.distributions.id, exceptId)
			)
		)
		.get();

export function addDistribution(
	v: DistributionInput,
	source: string,
	importItemId: number | null = null
): number | string {
	if (distributionTaken(v.instrumentId, v.date))
		return 'There is already a distribution for that fund on that day.';
	const now = new Date();
	return db
		.insert(schema.distributions)
		.values({ ...v, source, importItemId, createdAt: now, updatedAt: now })
		.returning({ id: schema.distributions.id })
		.get().id;
}

export function updateDistribution(
	id: number,
	v: Partial<DistributionInput>,
	reason: string | null
): string | null {
	const before = findDistribution(id);
	if (!before) return 'That distribution is gone.';
	if (
		distributionTaken(v.instrumentId ?? before.instrumentId, v.date ?? before.date, id) &&
		(v.instrumentId !== undefined || v.date !== undefined)
	)
		return 'There is already a distribution for that fund on that day.';
	recordEdits('distribution', id, before, v, reason);
	db.update(schema.distributions)
		.set({ ...v, updatedAt: new Date() })
		.where(eq(schema.distributions.id, id))
		.run();
	return null;
}

export function deleteDistribution(id: number, reason: string | null) {
	const before = findDistribution(id);
	if (!before) return;
	db.insert(schema.edits)
		.values({
			entity: 'distribution',
			entityKey: String(id),
			field: 'deleted',
			oldValue: JSON.stringify(before),
			newValue: null,
			reason,
			at: new Date()
		})
		.run();
	db.delete(schema.distributions).where(eq(schema.distributions.id, id)).run();
}

/** A record's changes, newest first. */
export function editsOf(entity: 'trade' | 'distribution', id: number) {
	return db
		.select()
		.from(schema.edits)
		.where(and(eq(schema.edits.entity, entity), eq(schema.edits.entityKey, String(id))))
		.orderBy(desc(schema.edits.at), desc(schema.edits.id))
		.all();
}

/** Every fund, for the pickers. */
export function fundChoices() {
	return db
		.select({ id: schema.instruments.id, ticker: schema.instruments.ticker })
		.from(schema.instruments)
		.orderBy(schema.instruments.ticker)
		.all();
}
