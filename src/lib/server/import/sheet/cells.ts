import type { Cell, Sheet } from '../xlsx';

/* Small readers shared by the sheet import areas. */

export const num = (c: Cell): number | null => {
	if (typeof c === 'number') return c;
	if (typeof c === 'string') {
		const n = Number(c.replace(/[$,\s]/g, ''));
		return c.trim() !== '' && Number.isFinite(n) ? n : null;
	}
	return null;
};
export const cents = (c: Cell) => Math.round((num(c) ?? 0) * 100);
export const text = (c: Cell) => (c == null ? '' : String(c).trim());

/** First cell whose text matches, searching the given rows. */
export function find(sheet: Sheet, match: (s: string) => boolean, rows = sheet.maxRow) {
	for (let r = 1; r <= Math.min(rows, sheet.maxRow); r++)
		for (let c = 1; c <= sheet.maxCol; c++) {
			const v = sheet.at(r, c);
			if (typeof v === 'string' && match(v.trim())) return { row: r, col: c };
		}
	return null;
}
export const is = (label: string) => (s: string) => s.toLowerCase() === label.toLowerCase();
export const starts = (label: string) => (s: string) =>
	s.toLowerCase().startsWith(label.toLowerCase());

export function need<T>(v: T | null | undefined, what: string): T {
	if (v == null) throw new Error(`Couldn't find ${what} in the sheet`);
	return v;
}
