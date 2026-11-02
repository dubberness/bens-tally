import { error, fail, redirect } from '@sveltejs/kit';
import { parseMoney } from '$lib/money';
import {
	closeAccount,
	getAccount,
	getCalculation,
	KINDS,
	reopenAccount,
	setCalculation,
	SOURCES,
	updateAccount
} from '$lib/server/history/accounts-admin';
import { allAccounts } from '$lib/server/history/snapshots';
import { KIND_LABEL } from '$lib/server/history/view';
import type { CalculationKind } from '$lib/server/history/schedule';
import { localDate } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const account = getAccount(Number(params.id));
	if (!account) error(404, 'No such account');
	const calc = getCalculation(account.id);
	return {
		account,
		calc: calc ? { kind: calc.kind, params: calc.params as Record<string, unknown> } : null,
		others: allAccounts()
			.filter((a) => a.id !== account.id)
			.map((a) => ({ id: a.id, name: a.name })),
		kinds: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
		sources: SOURCES,
		today: localDate()
	};
};

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const intOrNull = (s: string) =>
	s === '' ? null : Number.isFinite(Number(s)) ? Math.round(Number(s)) : null;
/** "2.99" (percent) → 299 basis points. */
const pctToBp = (s: string) => {
	const n = Number(s.replace('%', ''));
	return s === '' || !Number.isFinite(n) ? null : Math.round(n * 10_000) / 100;
};

export const actions: Actions = {
	save: async ({ request, params }) => {
		const f = await request.formData();
		const name = str(f, 'name');
		const kind = str(f, 'kind');
		if (!name) return fail(400, { error: 'Give it a name' });
		if (!(KINDS as readonly string[]).includes(kind)) return fail(400, { error: 'Pick a kind' });
		const source = str(f, 'source');
		if (!(SOURCES as readonly string[]).includes(source))
			return fail(400, { error: 'Pick where its value comes from' });
		updateAccount(Number(params.id), {
			name,
			kind,
			side: str(f, 'side') === 'liability' ? 'liability' : 'asset',
			source,
			colour: f.get('useColour') === 'on' ? str(f, 'colour') || null : null,
			icon: str(f, 'icon') || null,
			investable: f.get('investable') === 'on',
			closeOrder: intOrNull(str(f, 'closeOrder')),
			updateEveryDays: intOrNull(str(f, 'updateEveryDays')),
			openedOn: str(f, 'openedOn') || null,
			note: str(f, 'note') || null
		});
		return { saved: true };
	},
	calc: async ({ request, params }) => {
		const f = await request.formData();
		const kind = str(f, 'calcKind') as CalculationKind | '';
		const id = Number(params.id);
		if (!kind) {
			setCalculation(id, null, null);
			return { calcSaved: true };
		}
		if (kind === 'share_of') {
			const target = Number(f.get('target'));
			const shareBp = pctToBp(str(f, 'share'));
			if (!target || shareBp == null)
				return fail(400, { calcError: 'Pick the account and the share' });
			setCalculation(id, kind, { accountId: target, shareBp });
		} else if (kind === 'amortised') {
			const principalCents = parseMoney(str(f, 'principal'));
			const annualRateBp = pctToBp(str(f, 'rate'));
			const repaymentCents = parseMoney(str(f, 'repayment'));
			const firstPaymentDate = str(f, 'firstPayment');
			if (
				principalCents == null ||
				annualRateBp == null ||
				repaymentCents == null ||
				!firstPaymentDate
			)
				return fail(400, {
					calcError: 'Fill in the amount borrowed, rate, repayment and first repayment date'
				});
			setCalculation(id, kind, {
				principalCents,
				annualRateBp,
				repaymentCents,
				firstPaymentDate,
				payments: intOrNull(str(f, 'payments'))
			});
		} else if (kind === 'loan_terms') {
			const annualRateBp = pctToBp(str(f, 'rate'));
			const repaymentCents = parseMoney(str(f, 'repayment'));
			if (annualRateBp == null || repaymentCents == null)
				return fail(400, { calcError: 'Fill in the rate and the repayment' });
			setCalculation(id, kind, {
				annualRateBp,
				repaymentCents,
				paymentDay: intOrNull(str(f, 'paymentDay'))
			});
		} else return fail(400, { calcError: 'Unknown calculation' });
		return { calcSaved: true };
	},
	close: async ({ request, params }) => {
		closeAccount(Number(params.id), str(await request.formData(), 'on') || localDate());
		return { saved: true };
	},
	reopen: async ({ params }) => {
		reopenAccount(Number(params.id));
		return { saved: true };
	},
	done: async ({ params }) => redirect(303, `/accounts/${params.id}`)
};
