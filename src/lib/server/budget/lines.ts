import { and, asc, desc, eq, lte } from 'drizzle-orm';
import { db, schema } from '../db';

export type BudgetLine = typeof schema.budgetLines.$inferSelect;
export type BudgetAmount = typeof schema.budgetAmounts.$inferSelect;
export type Period = 'week' | 'month' | 'year';

export const GROUPS = ['bills', 'living', 'fun', 'savings', 'investing'] as const;
export type Group = (typeof GROUPS)[number];
export const GROUP_LABELS: Record<Group, string> = {
	bills: 'Bills',
	living: 'Living',
	fun: 'Fun',
	savings: 'Savings',
	investing: 'Investing'
};

/** Average weeks in a month (365.25 days a year). */
export const WEEKS_PER_MONTH = 365.25 / 7 / 12;

/** An amount over its period, as a monthly figure in cents. */
export function monthly(amountCents: number, period: string): number {
	if (period === 'week') return Math.round(amountCents * WEEKS_PER_MONTH);
	if (period === 'year') return Math.round(amountCents / 12);
	return amountCents;
}

export function activeIn(line: Pick<BudgetLine, 'startMonth' | 'endMonth'>, month: string) {
	return (
		(!line.startMonth || line.startMonth <= month) && (!line.endMonth || line.endMonth >= month)
	);
}

export function allLines(): BudgetLine[] {
	return db
		.select()
		.from(schema.budgetLines)
		.orderBy(asc(schema.budgetLines.sortOrder), asc(schema.budgetLines.id))
		.all();
}

/** The amount in force for a line in a month: the latest change on or before it. */
export function amountFor(lineId: number, month: string): BudgetAmount | null {
	return (
		db
			.select()
			.from(schema.budgetAmounts)
			.where(
				and(eq(schema.budgetAmounts.lineId, lineId), lte(schema.budgetAmounts.fromMonth, month))
			)
			.orderBy(desc(schema.budgetAmounts.fromMonth))
			.limit(1)
			.get() ?? null
	);
}

export function planFor(lineId: number, month: string): number {
	const a = amountFor(lineId, month);
	return a ? monthly(a.amountCents, a.period) : 0;
}

/** Sets a line's amount from a month on; earlier months keep the plan of their time. */
export function setAmount(lineId: number, fromMonth: string, amountCents: number, period: Period) {
	db.insert(schema.budgetAmounts)
		.values({ lineId, fromMonth, amountCents, period })
		.onConflictDoUpdate({
			target: [schema.budgetAmounts.lineId, schema.budgetAmounts.fromMonth],
			set: { amountCents, period }
		})
		.run();
}

export function amountHistory(lineId: number): BudgetAmount[] {
	return db
		.select()
		.from(schema.budgetAmounts)
		.where(eq(schema.budgetAmounts.lineId, lineId))
		.orderBy(desc(schema.budgetAmounts.fromMonth))
		.all();
}

/** The latest month any plan amount changed, for "plan last set in …". */
export function lastPlanChange(): string | null {
	const row = db
		.select({ m: schema.budgetAmounts.fromMonth })
		.from(schema.budgetAmounts)
		.orderBy(desc(schema.budgetAmounts.fromMonth))
		.limit(1)
		.get();
	return row?.m ?? null;
}

export function paySplits() {
	return db
		.select()
		.from(schema.paySplits)
		.orderBy(asc(schema.paySplits.sortOrder), asc(schema.paySplits.id))
		.all();
}

export function yearlyBills() {
	return db.select().from(schema.yearlyBills).orderBy(asc(schema.yearlyBills.id)).all();
}
