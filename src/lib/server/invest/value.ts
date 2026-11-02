import { localDate } from '$lib/time';
import type { ValueProvider } from '../ledger/value';
import { holdings } from './holdings';

/**
 * An investment account: units held × price on the date. Null (so the latest typed
 * balance is used) when the account holds no instruments or one has no price at all.
 */
export const investValue: ValueProvider = (account, date) => {
	const held = holdings(date, account.id).filter((h) => h.unitsE6 > 0);
	if (!held.length || held.some((h) => h.valueCents == null)) return null;
	const fallback = held.some((h) => h.price?.source === 'trade');
	return {
		valueCents: held.reduce((s, h) => s + (h.valueCents ?? 0), 0),
		asOf: date ?? localDate(),
		badge: held.some((h) => h.price?.source === 'email') ? 'email' : fallback ? 'estimate' : 'live'
	};
};
