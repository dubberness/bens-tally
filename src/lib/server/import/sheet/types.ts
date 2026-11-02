import type { Workbook } from '../xlsx';

export interface ReportLine {
	/** ok | warn | fail */
	level: 'ok' | 'warn' | 'fail';
	area: string;
	message: string;
}

export interface SheetContext {
	wb: Workbook;
	now: Date;
	report: (level: ReportLine['level'], message: string) => void;
}

/**
 * One area's part of the sheet import. `wipe` removes everything an earlier run
 * made (rows with origin or source 'sheet'); `run` loads it again. Areas run in
 * the order listed in index.ts, inside one database transaction.
 */
export interface SheetArea {
	id: string;
	label: string;
	wipe: () => void;
	run: (ctx: SheetContext) => void;
	/** Not built yet: offered nowhere, so a run can't claim it loaded anything. */
	pending?: boolean;
	/** Compares the result with the sheet's own figures; runs after every area has loaded. */
	validate?: (ctx: SheetContext) => void;
}
