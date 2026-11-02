import { formatMoney } from '$lib/money';
import { shortDate } from '$lib/time';

/** How a stored field reads in a record's history. */
const FIELDS: Record<string, [string, (v: string) => string]> = {
	date: ['Date', (v) => shortDate(v, { year: true })],
	side: ['Buy or sell', (v) => v],
	unitsE6: ['Units', (v) => String(Number(v) / 1e6)],
	priceE4: ['Price', (v) => `$${(Number(v) / 1e4).toFixed(4)}`],
	valueCents: ['Value', (v) => formatMoney(Number(v), { cents: true })],
	feeCents: ['Fee', (v) => formatMoney(Number(v), { cents: true })],
	amountCents: ['Amount', (v) => formatMoney(Number(v), { cents: true })],
	frankingCents: ['Franking credits', (v) => formatMoney(Number(v), { cents: true })],
	perUnitE6: ['Per unit', (v) => `$${(Number(v) / 1e6).toFixed(6)}`],
	reinvested: ['Reinvested', (v) => (v === 'true' || v === '1' ? 'yes' : 'no')],
	orderId: ['Order ID', (v) => v],
	note: ['Note', (v) => v]
};

export function describeEdit(
	e: { field: string; oldValue: string | null; newValue: string | null },
	fund: (id: number) => string | undefined = () => undefined
) {
	if (e.field === 'instrumentId') {
		const name = (v: string | null) => (v ? (fund(Number(v)) ?? `fund #${v}`) : 'blank');
		return `Fund: ${name(e.oldValue)} → ${name(e.newValue)}`;
	}
	const [label, fmt] = FIELDS[e.field] ?? [e.field, (v: string) => v];
	const show = (v: string | null) => (v == null || v === '' ? 'blank' : fmt(v));
	return `${label}: ${show(e.oldValue)} → ${show(e.newValue)}`;
}

export const SOURCE_TEXT: Record<string, string> = {
	sheet: 'Loaded from the Personal Wealth sheet.',
	email: 'Read from a Betashares email.',
	csv: 'Loaded from a Betashares CSV.',
	manual: 'Added by you.'
};
