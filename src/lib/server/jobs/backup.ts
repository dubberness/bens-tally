import fs from 'node:fs';
import path from 'node:path';
import { sqlite } from '../db';
import { backupDir } from '../env';
import { localDate, localMonth } from '$lib/time';
import { toPrune } from './retention';

export const KEEP_DAILY = 14;
export const KEEP_MONTHLY = 12;

const dailyDir = path.join(backupDir, 'daily');
const monthlyDir = path.join(backupDir, 'monthly');

/** SQLite online backup: safe while the app is running. */
export async function runBackup(now = new Date()): Promise<string> {
	fs.mkdirSync(dailyDir, { recursive: true });
	fs.mkdirSync(monthlyDir, { recursive: true });

	const daily = path.join(dailyDir, `tally-${localDate(now)}.db`);
	const tmp = `${daily}.part`;
	await sqlite.backup(tmp);
	fs.renameSync(tmp, daily);

	// The first backup of each month is also kept as that month's copy.
	const monthly = path.join(monthlyDir, `tally-${localMonth(now)}.db`);
	let note = '';
	if (!fs.existsSync(monthly)) {
		fs.copyFileSync(daily, monthly);
		note = ' and monthly copy';
	}

	for (const [dir, keep] of [
		[dailyDir, KEEP_DAILY],
		[monthlyDir, KEEP_MONTHLY]
	] as const) {
		for (const name of toPrune(fs.readdirSync(dir), keep)) fs.rmSync(path.join(dir, name));
	}

	const kb = Math.round(fs.statSync(daily).size / 1024);
	return `Saved ${path.basename(daily)} (${kb} KB)${note}`;
}

export interface BackupFile {
	kind: 'daily' | 'monthly';
	name: string;
	bytes: number;
	modified: number;
}

export function listBackups(): BackupFile[] {
	const out: BackupFile[] = [];
	for (const [kind, dir] of [
		['daily', dailyDir],
		['monthly', monthlyDir]
	] as const) {
		if (!fs.existsSync(dir)) continue;
		for (const name of fs.readdirSync(dir)) {
			if (!name.endsWith('.db')) continue;
			const st = fs.statSync(path.join(dir, name));
			out.push({ kind, name, bytes: st.size, modified: st.mtimeMs });
		}
	}
	return out.sort((a, b) => b.modified - a.modified);
}
