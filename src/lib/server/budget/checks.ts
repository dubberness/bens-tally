import type { Check, CheckSource } from '../checks/types';
import { formatMoney } from '$lib/money';
import { monthLabel } from '$lib/time';
import { budgetSetting, BUDGET_SETTINGS } from './settings';
import { merchantGaps } from './merchants';
import { payView } from './month';

/** A rule's merchant stopped matching while another merchant took its place. */
export const merchantCheck: CheckSource = () =>
	merchantGaps().flatMap((g): Check[] => {
		const name = g.rule.match.merchant!;
		const since = monthLabel(g.lastHit.slice(0, 7));
		if (g.candidate)
			return [
				{
					key: `budget:merchant:${g.rule.id}`,
					level: 'warn',
					message: `${g.lineName}: nothing from “${name}” since ${since}, but “${g.candidate.merchant}” keeps showing up under ${g.candidate.category}.`,
					fixHref: `/manage/rules/${g.rule.id}?merchant=${encodeURIComponent(g.candidate.merchant)}`,
					fixLabel: `Change merchant to ${g.candidate.merchant}`,
					fingerprint: `${g.lastHit}|${g.candidate.merchant}`
				}
			];
		if (!g.recurring) return [];
		return [
			{
				key: `budget:merchant:${g.rule.id}`,
				level: 'info',
				message: `${g.lineName}: nothing from “${name}” since ${since}. Has it moved to another provider?`,
				fixHref: `/manage/rules/${g.rule.id}`,
				fixLabel: 'Check the rule',
				fingerprint: g.lastHit
			}
		];
	});

/** The pay split against the real pay, and each saver's real transfers against the plan. */
export const payChecks: CheckSource = () => {
	const pay = payView();
	const out: Check[] = [];
	const tolerance = budgetSetting<number>(BUDGET_SETTINGS.tolerance);
	const per =
		pay.regular?.frequency === 'month' ? 'a month' : `a ${pay.regular?.frequency ?? 'pay'}`;
	if (pay.regular && pay.splits.some((s) => s.planCents != null)) {
		const diff = pay.totalCents - pay.regular.regularCents;
		if (Math.abs(diff) > tolerance)
			out.push({
				key: 'budget:pay-split',
				level: 'warn',
				message: `The pay split adds up to ${formatMoney(pay.totalCents)} ${per}, ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than your pay of ${formatMoney(pay.regular.regularCents)}.`,
				fixHref: '/budget/edit#pay',
				fixLabel: 'Update the plan',
				fingerprint: `${pay.totalCents}|${pay.regular.regularCents}`
			});
	}
	if (pay.regular)
		for (const s of pay.splits) {
			if (s.planCents == null) continue;
			if (Math.abs(s.realCents - s.planCents) <= tolerance) continue;
			out.push({
				key: `budget:saver:${s.accountId}`,
				level: 'warn',
				message: `${s.name} really gets ${formatMoney(s.realCents)} ${per}; the plan says ${formatMoney(s.planCents)}.`,
				fixHref: '/budget/edit#pay',
				fixLabel: 'Update the plan',
				fingerprint: `${s.planCents}|${s.realCents}`
			});
		}
	return out;
};

export const budgetChecks: CheckSource[] = [merchantCheck, payChecks];
