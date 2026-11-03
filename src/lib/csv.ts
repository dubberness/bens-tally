/** One CSV cell: quoted when it holds a comma, quote or line break; empty for null. */
export function csvCell(value: string | number | boolean | null | undefined): string {
	if (value == null) return '';
	const s = String(value);
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows of cells as CSV text, one line per row (an empty row gives a blank line). */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
	return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
