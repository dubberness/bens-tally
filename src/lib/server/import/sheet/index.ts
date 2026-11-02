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

/** Wipe everything an earlier import made, load the workbook again, then validate. */
export function runSheetImport(
	data: Uint8Array,
	fileName: string,
	now = new Date()
): SheetImportResult {
	if (sheetImportClosed()) throw new Error('The sheet import is switched off');
	const wb = readWorkbook(data);
	const lines: ReportLine[] = [];
	let area = 'import';
	const ctx: SheetContext = {
		wb,
		now,
		report: (level, message) => lines.push({ level, area, message })
	};
	try {
		sqlite.transaction(() => {
			for (const a of [...areas].reverse()) {
				area = a.id;
				a.wipe();
			}
			for (const a of areas) {
				area = a.id;
				a.run(ctx);
			}
		})();
		for (const a of areas) {
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
		lines
	};
	setSetting(LAST_KEY, result);
	return result;
}
