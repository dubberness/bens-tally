/**
 * Backup files are named tally-YYYY-MM-DD.db (daily) or tally-YYYY-MM.db (monthly), so a
 * name sort is a date sort. Returns the names to delete, keeping the newest `keep`.
 */
export function toPrune(names: string[], keep: number): string[] {
	const ours = names.filter((n) => /^tally-\d{4}-\d{2}(-\d{2})?\.db$/.test(n)).sort();
	return ours.slice(0, Math.max(0, ours.length - keep));
}
