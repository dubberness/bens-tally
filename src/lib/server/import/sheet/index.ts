import { sqlite } from '../../db';
import { getSetting, setSetting } from '../../settings';
import { log } from '../../log';
import { readWorkbook } from '../xlsx';
import type { ReportLine, SheetArea, SheetContext } from './types';
import { historyArea } from './history';
import { investArea } from './invest';
import { budgetArea } from './budget';

/** Accounts and snapshots first: the other areas link to accounts. */
export const areas: SheetArea[] = [historyArea, investArea, budgetArea];

export interface SheetImportResult {
	at: number;
	fileName: string;
	ok: boolean;
	lines: ReportLine[];
}

export const LAST_KEY = 'sheet_import.last';
/** Set at go-live; the import is then switched off. */
export const CLOSED_KEY = 'sheet_import.closed';

export function sheetImportClosed(): boolean {
	return getSetting<boolean>(CLOSED_KEY) === true;
}

/** Areas the last import report covers. */
export function loadedAreas(): string[] {
	const last = getSetting<SheetImportResult>(LAST_KEY);
	return last?.ok ? [...new Set(last.lines.map((l) => l.area))] : [];
}

/**
 * Wipe everything an earlier import made, load the workbook again, then validate.
 * With `only`, just those areas are wiped and loaded (the others keep what they have,
 * and their lines in the last report); after go-live that's allowed only for an area
 * the sheet never loaded, so a new part of the app can still pick up the sheet's history.
 */
export function runSheetImport(
	data: Uint8Array,
	fileName: string,
	now = new Date(),
	only?: string[]
): SheetImportResult {
	const chosen = only?.length ? areas.filter((a) => only.includes(a.id)) : areas;
	if (sheetImportClosed()) {
		const loaded = loadedAreas();
		if (!only?.length || chosen.some((a) => loaded.includes(a.id)))
			throw new Error('The sheet import is switched off');
	}
	const wb = readWorkbook(data);
	const kept =
		only?.length && getSetting<SheetImportResult>(LAST_KEY)?.ok
			? getSetting<SheetImportResult>(LAST_KEY)!.lines.filter(
					(l) => !chosen.some((a) => a.id === l.area)
				)
			: [];
	const lines: ReportLine[] = [];
	let area = 'import';
	const ctx: SheetContext = {
		wb,
		now,
		report: (level, message) => lines.push({ level, area, message })
	};
	try {
		sqlite.transaction(() => {
			for (const a of [...chosen].reverse()) {
				area = a.id;
				a.wipe();
			}
			for (const a of chosen) {
				area = a.id;
				a.run(ctx);
			}
		})();
		for (const a of chosen) {
			area = a.id;
			a.validate?.(ctx);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		lines.push({ level: 'fail', area, message: `Stopped: ${message}. Nothing was changed.` });
		log('error', 'Sheet import failed', { area, message });
	}
	const result: SheetImportResult = {
		at: now.getTime(),
		fileName,
		ok: !lines.some((l) => l.level === 'fail'),
		lines: [...kept, ...lines]
	};
	setSetting(LAST_KEY, result);
	return result;
}
