import { asc, eq, isNull, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { accountValue } from '../ledger/value';
import { averageInvesting, averageSpending } from '../budget/month';
import { budgetSetting, BUDGET_SETTINGS } from '../budget/settings';
import { birthDate } from '../history/prefs';
import { localDate } from '$lib/time';
import type { PlanContext } from '$lib/plan/params';

/** What the model reads from the rest of the app: measured averages, Settings, account values. */
export function planContext(today: string = localDate()): PlanContext {
	const includeOneOffs = budgetSetting<boolean>(BUDGET_SETTINGS.includeOneOffs);
	const rows = db
		.select()
		.from(schema.accounts)
		.where(and(eq(schema.accounts.side, 'asset'), isNull(schema.accounts.closedOn)))
		.orderBy(asc(schema.accounts.sortOrder), asc(schema.accounts.name))
		.all();
	return {
		today,
		measuredSpending: averageSpending(12, includeOneOffs),
		measuredInvesting: averageInvesting(3),
		settingsBirthDate: birthDate(),
		accounts: rows.map((a) => {
			const v = accountValue(a, null);
			return {
				id: a.id,
				name: a.name,
				kind: a.kind,
				investable: a.investable,
				valueCents: v?.valueCents ?? 0,
				asOf: v?.asOf ?? null
			};
		})
	};
}
