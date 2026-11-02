import { fail } from '@sveltejs/kit';
import { allPrefs, PREFS, savePrefs, type Theme } from '$lib/server/history/prefs';
import { updateAccount } from '$lib/server/history/accounts-admin';
import { allAccounts } from '$lib/server/history/snapshots';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	prefs: allPrefs(),
	help: Object.fromEntries(
		Object.entries(PREFS).map(([k, d]) => [k, { label: d.label, help: d.help }])
	),
	accounts: allAccounts()
		.filter((a) => !a.closedOn)
		.map((a) => ({ id: a.id, name: a.name, investable: a.investable }))
});

export const actions: Actions = {
	save: async ({ request }) => {
		const f = await request.formData();
		const payday = String(f.get('payday') ?? '');
		const closeTime = String(f.get('closeTime') ?? '');
		const birthDate = String(f.get('birthDate') ?? '');
		const sure = Number(String(f.get('sure') ?? '').replace('%', ''));
		const theme = String(f.get('theme') ?? 'dark') as Theme;
		if (closeTime && !/^\d{2}:\d{2}$/.test(closeTime))
			return fail(400, { error: 'Use a time like 23:59' });
		if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
			return fail(400, { error: 'Pick a birth date' });
		if (!Number.isFinite(sure) || sure < 0 || sure > 100)
			return fail(400, { error: 'The “Sure?” threshold is a percentage' });
		savePrefs({
			payday: payday === '' ? null : Number(payday),
			closeTime: closeTime || PREFS.closeTime.fallback,
			birthDate: birthDate || null,
			sureBp: Math.round(sure * 100),
			theme: ['dark', 'light', 'system'].includes(theme) ? theme : 'dark'
		});
		const investable = new Set(f.getAll('investable').map(Number));
		for (const a of allAccounts()) {
			if (a.closedOn) continue;
			const want = investable.has(a.id);
			if (want !== a.investable) updateAccount(a.id, { investable: want });
		}
		return { saved: true };
	}
};
