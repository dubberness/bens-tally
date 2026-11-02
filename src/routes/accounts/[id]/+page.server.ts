import { error, fail } from '@sveltejs/kit';
import { parseMoney } from '$lib/money';
import { localDate, monthName } from '$lib/time';
import { accountValue } from '$lib/server/ledger/value';
import { listTransactions } from '$lib/server/up/transactions';
import {
	addBalance,
	balancesOf,
	closeAccount,
	deleteBalance,
	getAccount,
	reopenAccount,
	updateBalance
} from '$lib/server/history/accounts-admin';
import { allAccounts, lockedSnapshots, snapshotValues } from '$lib/server/history/snapshots';
import { badgeText, colourFor, detailFor, KIND_LABEL } from '$lib/server/history/view';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const account = getAccount(Number(params.id));
	if (!account) error(404, 'No such account');
	const accounts = allAccounts();
	const names = new Map(accounts.map((a) => [a.id, a.name]));
	const value = accountValue(account, null);
	const history = lockedSnapshots()
		.map((s) => ({
			key: s.month,
			label: monthName(s.month),
			value: snapshotValues(s.month).get(account.id)
		}))
		.filter((p): p is { key: string; label: string; value: number } => p.value != null);
	if (value && !account.closedOn)
		history.push({ key: 'now', label: 'Now', value: value.valueCents });
	const debtIndex = accounts
		.filter((a) => a.side === 'liability')
		.findIndex((a) => a.id === account.id);
	const tx = account.upAccountId ? listTransactions({ accountId: account.id, limit: 20 }) : null;
	return {
		account,
		transactions: tx
			? {
					total: tx.total,
					rows: tx.rows.map((t) => ({
						id: t.id,
						date: t.date,
						description: t.description,
						amountCents: t.amountCents,
						held: t.status === 'HELD',
						category: t.category
					}))
				}
			: null,
		kindLabel: KIND_LABEL[account.kind] ?? account.kind,
		colour: colourFor(account, Math.max(0, debtIndex)),
		value,
		badge:
			account.kind === 'property' && value && value.badge !== 'calculated'
				? 'Estimate'
				: badgeText(value),
		detail: detailFor(account, names),
		history,
		balances: balancesOf(account.id).map((b) => ({
			id: b.id,
			date: b.date,
			valueCents: b.valueCents,
			source: b.source,
			reestimate: b.reestimate,
			note: b.note
		})),
		today: localDate()
	};
};

function readEntry(f: FormData) {
	const date = String(f.get('date') ?? '');
	const valueCents = parseMoney(String(f.get('value') ?? ''));
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick a date' } as const;
	if (valueCents == null) return { error: 'That isn’t an amount' } as const;
	return {
		entry: {
			date,
			valueCents: Math.abs(valueCents),
			reestimate: f.get('reestimate') === 'on',
			note: String(f.get('note') ?? '')
		}
	} as const;
}

export const actions: Actions = {
	add: async ({ request, params }) => {
		const r = readEntry(await request.formData());
		if ('error' in r) return fail(400, { error: r.error });
		addBalance(Number(params.id), r.entry);
		return { saved: true };
	},
	update: async ({ request }) => {
		const f = await request.formData();
		const r = readEntry(f);
		if ('error' in r) return fail(400, { error: r.error, editId: Number(f.get('id')) });
		updateBalance(Number(f.get('id')), r.entry);
		return { saved: true };
	},
	delete: async ({ request }) => {
		deleteBalance(Number((await request.formData()).get('id')));
		return { deleted: true };
	},
	close: async ({ request, params }) => {
		const on = String((await request.formData()).get('on') ?? '') || localDate();
		closeAccount(Number(params.id), on);
		return { closed: true };
	},
	reopen: async ({ params }) => {
		reopenAccount(Number(params.id));
		return { reopened: true };
	}
};
