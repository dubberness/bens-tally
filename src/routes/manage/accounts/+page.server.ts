import { fail } from '@sveltejs/kit';
import { formatMoney } from '$lib/money';
import { accountValue } from '$lib/server/ledger/value';
import {
	createAccount,
	KINDS,
	mergeAccounts,
	moveAccount,
	SIDES,
	SOURCES,
	updateAccount
} from '$lib/server/history/accounts-admin';
import { allAccounts } from '$lib/server/history/snapshots';
import { KIND_LABEL } from '$lib/server/history/view';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const accounts = allAccounts().map((a) => {
		const v = accountValue(a, null);
		return {
			id: a.id,
			name: a.name,
			kind: KIND_LABEL[a.kind] ?? a.kind,
			side: a.side,
			source: a.source,
			closedOn: a.closedOn,
			closeOrder: a.closeOrder,
			investable: a.investable,
			value: v ? formatMoney(a.side === 'liability' ? -v.valueCents : v.valueCents) : '—'
		};
	});
	return {
		accounts,
		closeList: accounts
			.filter((a) => a.closeOrder != null && !a.closedOn)
			.sort((a, b) => a.closeOrder! - b.closeOrder! || a.id - b.id),
		kinds: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
		sides: SIDES,
		sources: SOURCES
	};
};

const id = (f: FormData, k = 'id') => Number(f.get(k));

export const actions: Actions = {
	add: async ({ request }) => {
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		const kind = String(f.get('kind') ?? '');
		const source = String(f.get('source') ?? 'manual');
		if (!name) return fail(400, { addError: 'Give it a name' });
		if (!(KINDS as readonly string[]).includes(kind)) return fail(400, { addError: 'Pick a kind' });
		const side = kind === 'loan' ? 'liability' : String(f.get('side') ?? 'asset');
		createAccount({
			name,
			kind,
			side,
			source,
			colour: null,
			icon: null,
			investable: kind === 'cash' || kind === 'investment',
			closeOrder: null,
			updateEveryDays: null,
			note: null,
			openedOn: null
		});
		return { added: name };
	},
	move: async ({ request }) => {
		const f = await request.formData();
		moveAccount(
			id(f),
			f.get('dir') === 'up' ? -1 : 1,
			f.get('list') === 'close' ? 'closeOrder' : 'sortOrder'
		);
		return {};
	},
	closeList: async ({ request }) => {
		const f = await request.formData();
		const accountId = id(f);
		if (f.get('op') === 'remove') updateAccount(accountId, { closeOrder: null });
		else {
			const max = Math.max(0, ...allAccounts().map((a) => a.closeOrder ?? 0));
			updateAccount(accountId, { closeOrder: max + 10 });
		}
		return {};
	},
	merge: async ({ request }) => {
		const f = await request.formData();
		if (f.get('confirm') !== 'yes') return fail(400, { mergeError: 'Tick the box to confirm' });
		try {
			mergeAccounts(id(f, 'keep'), id(f, 'remove'));
		} catch (err) {
			return fail(400, { mergeError: err instanceof Error ? err.message : String(err) });
		}
		return { merged: true };
	}
};
