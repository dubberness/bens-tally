import { and, count, desc, eq, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';
import { lastDayOfMonth } from '$lib/time';
import { parseMoney } from '$lib/money';

export interface TransactionQuery {
	accountId?: number;
	/** YYYY-MM */
	month?: string;
	/** Matches description, raw text, message, category or tag; an amount like "12.50" matches either sign. */
	search?: string;
	limit?: number;
	offset?: number;
}

export interface TransactionItem {
	id: string;
	date: string;
	createdAt: number;
	status: string;
	description: string;
	rawText: string | null;
	message: string | null;
	amountCents: number;
	/** Extra taken by a Round Up on this purchase (negative), else 0. */
	roundUpCents: number;
	/** e.g. "-12.00 USD" for international purchases. */
	foreign: string | null;
	category: string | null;
	parentCategory: string | null;
	tags: string[];
	accountId: number | null;
	accountName: string | null;
	transferUpAccountId: string | null;
	transferAccountName: string | null;
	assignment: {
		action: string;
		budgetLineId: number | null;
		budgetLineName: string | null;
		ruleId: number | null;
		byHand: boolean;
		note: string | null;
	} | null;
}

function where(q: TransactionQuery): SQL | undefined {
	const t = schema.transactions;
	const parts: (SQL | undefined)[] = [];
	if (q.accountId) parts.push(eq(t.accountId, q.accountId));
	if (q.month && /^\d{4}-\d{2}$/.test(q.month))
		parts.push(sql`${t.date} between ${`${q.month}-01`} and ${lastDayOfMonth(q.month)}`);
	const s = q.search?.trim();
	if (s) {
		const pat = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
		const text = (col: SQL | AnyColumn) => sql`${col} like ${pat} escape '\\'`;
		const ors: SQL[] = [
			text(t.description),
			text(sql`coalesce(${t.rawText}, '')`),
			text(sql`coalesce(${t.message}, '')`),
			text(sql`coalesce(${t.category}, '')`),
			text(sql`coalesce(${t.tags}, '')`)
		];
		const cents = parseMoney(s);
		if (cents !== null && /\d/.test(s)) ors.push(sql`abs(${t.amountCents}) = ${Math.abs(cents)}`);
		parts.push(or(...ors));
	}
	return parts.length ? and(...parts) : undefined;
}

/**
 * Up transactions, newest first, each with its assignment (budget line or exclusion) when
 * it has one. For the account page (accountId), the budget screen (month) and /transactions.
 */
export function listTransactions(q: TransactionQuery = {}): {
	rows: TransactionItem[];
	total: number;
} {
	const t = schema.transactions;
	const transferAcct = db
		.select({ upAccountId: schema.accounts.upAccountId, name: schema.accounts.name })
		.from(schema.accounts)
		.as('transfer_acct');
	const w = where(q);
	const limit = Math.min(Math.max(q.limit ?? 50, 1), 1000);
	const offset = Math.max(q.offset ?? 0, 0);

	const rows = db
		.select({
			t,
			accountName: schema.accounts.name,
			transferAccountName: transferAcct.name,
			a: schema.assignments,
			lineName: schema.budgetLines.name,
			roundUp: sql<
				number | null
			>`json_extract(${t.raw}, '$.attributes.roundUp.amount.valueInBaseUnits')`,
			foreignValue: sql<string | null>`json_extract(${t.raw}, '$.attributes.foreignAmount.value')`,
			foreignCode: sql<
				string | null
			>`json_extract(${t.raw}, '$.attributes.foreignAmount.currencyCode')`
		})
		.from(t)
		.leftJoin(schema.accounts, eq(schema.accounts.id, t.accountId))
		.leftJoin(transferAcct, eq(transferAcct.upAccountId, t.transferUpAccountId))
		.leftJoin(schema.assignments, eq(schema.assignments.transactionId, t.id))
		.leftJoin(schema.budgetLines, eq(schema.budgetLines.id, schema.assignments.budgetLineId))
		.where(w)
		.orderBy(desc(t.createdAt), desc(t.id))
		.limit(limit)
		.offset(offset)
		.all();

	const total = db.select({ n: count() }).from(t).where(w).get()?.n ?? 0;

	return {
		total,
		rows: rows.map((r) => ({
			id: r.t.id,
			date: r.t.date,
			createdAt: r.t.createdAt.getTime(),
			status: r.t.status,
			description: r.t.description,
			rawText: r.t.rawText,
			message: r.t.message,
			amountCents: r.t.amountCents,
			roundUpCents: r.roundUp ?? 0,
			foreign: r.foreignValue ? `${r.foreignValue} ${r.foreignCode ?? ''}`.trim() : null,
			category: r.t.category,
			parentCategory: r.t.parentCategory,
			tags: r.t.tags ?? [],
			accountId: r.t.accountId,
			accountName: r.accountName,
			transferUpAccountId: r.t.transferUpAccountId,
			transferAccountName: r.transferAccountName,
			assignment: r.a
				? {
						action: r.a.action,
						budgetLineId: r.a.budgetLineId,
						budgetLineName: r.lineName,
						ruleId: r.a.ruleId,
						byHand: r.a.byHand,
						note: r.a.note
					}
				: null
		}))
	};
}

/** Count and date range of mirrored transactions per app account. */
export function transactionStats(): Map<
	number,
	{ count: number; earliest: string; latest: string }
> {
	const t = schema.transactions;
	return new Map(
		db
			.select({
				accountId: t.accountId,
				count: count(),
				earliest: sql<string>`min(${t.date})`,
				latest: sql<string>`max(${t.date})`
			})
			.from(t)
			.groupBy(t.accountId)
			.all()
			.filter((r) => r.accountId !== null)
			.map((r) => [
				r.accountId as number,
				{ count: r.count, earliest: r.earliest, latest: r.latest }
			])
	);
}

/** Months that have transactions, newest first, for a month filter. */
export function transactionMonths(): string[] {
	return db
		.selectDistinct({ m: sql<string>`substr(${schema.transactions.date}, 1, 7)` })
		.from(schema.transactions)
		.orderBy(desc(sql`1`))
		.all()
		.map((r) => r.m);
}
