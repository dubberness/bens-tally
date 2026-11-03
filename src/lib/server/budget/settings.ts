import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { getSetting, setSetting } from '../settings';

/**
 * Budget settings. The generic starting values below apply until Ben saves his own
 * in the budget editor; calculations always read the stored value when there is one.
 */
export const BUDGET_SETTINGS = {
	/** How far the pay split total or a saver's real transfers may drift before a check fires. */
	tolerance: { key: 'budget.check_tolerance_cents', seed: 20_00 },
	/** Months a budget line's merchant may be missing before the "new merchant?" check fires. */
	merchantGapMonths: { key: 'budget.merchant_gap_months', seed: 2 },
	/** week | fortnight | month; how often pay lands and the pay split is sent. */
	payFrequency: { key: 'budget.pay_frequency', seed: 'week' },
	/** The pay the plan was written for (the sheet's own figure), shown beside the real pay. */
	planPay: { key: 'budget.plan_pay_cents', seed: null as number | null },
	/** The yearly bills fund counts from this month, with this opening balance. */
	yearlyFundStart: { key: 'budget.yearly_fund_start', seed: null as string | null },
	yearlyFundOpening: { key: 'budget.yearly_fund_opening_cents', seed: 0 },
	/** Whether the Budget screen counts one-offs in living spend. */
	includeOneOffs: { key: 'budget.include_one_offs', seed: false }
} as const;

type Spec = (typeof BUDGET_SETTINGS)[keyof typeof BUDGET_SETTINGS];

export function budgetSetting<T>(spec: Spec): T {
	const v = getSetting<T>(spec.key);
	return (v === undefined || v === null ? spec.seed : v) as T;
}

export function setBudgetSetting(spec: Spec, value: unknown) {
	// "Not set" is the absence of a row, so the generic starting value applies again.
	if (value === null) db.delete(schema.settings).where(eq(schema.settings.key, spec.key)).run();
	else setSetting(spec.key, value);
}

export type PayFrequency = 'week' | 'fortnight' | 'month';
export const PAYS_PER_YEAR: Record<PayFrequency, number> = { week: 52, fortnight: 26, month: 12 };
