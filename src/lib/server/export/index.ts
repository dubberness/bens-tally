import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { toCsv } from '$lib/csv';
import { localDate } from '$lib/time';
import { sqlite, schema } from '../db';
import { zipStore } from './zip';

/*
 * Export everything (Manage): every table as one JSON file, or one CSV per table in a zip.
 * Tables come from the schema, so a table added later is exported without touching this file.
 */

/** Left out on purpose, with the reason shown on the Manage page. */
export const SKIPPED_TABLES: Record<string, string> = {
	sessions: 'sign-in cookies'
};
/** Single settings rows left out: who is allowed to sign in is not data to carry around. */
export const SKIPPED_SETTINGS = ['owner'];

export interface ExportTable {
	name: string;
	columns: string[];
	rows: Record<string, string | number | boolean | object | null>[];
}

type Value = ExportTable['rows'][number][string];

/** Column names are the database's own; timestamps become ISO text, booleans true/false, JSON stays JSON. */
function convert(dataType: string, v: unknown): Value {
	if (v == null) return null;
	if (dataType === 'date') return new Date(Number(v)).toISOString();
	if (dataType === 'boolean') return Boolean(v);
	if (dataType === 'json') return typeof v === 'string' ? (JSON.parse(v) as object) : (v as object);
	return v as string | number;
}

export function exportTables(): ExportTable[] {
	const tables = (Object.values(schema) as unknown[])
		.filter((t): t is SQLiteTable => is(t, SQLiteTable))
		.map((t) => getTableConfig(t))
		.filter((t) => !(t.name in SKIPPED_TABLES))
		.sort((a, b) => a.name.localeCompare(b.name));
	return tables.map((t) => {
		const raw = sqlite.prepare(`select * from "${t.name}"`).all() as Record<string, unknown>[];
		const kept =
			t.name === 'settings' ? raw.filter((r) => !SKIPPED_SETTINGS.includes(String(r.key))) : raw;
		return {
			name: t.name,
			columns: t.columns.map((c) => c.name),
			rows: kept.map((r) =>
				Object.fromEntries(t.columns.map((c) => [c.name, convert(c.dataType, r[c.name])]))
			)
		};
	});
}

export const exportName = (ext: 'json' | 'zip', at = new Date()) =>
	`tally-export-${localDate(at)}.${ext}`;

/** Every table in one JSON document. */
export function exportJson(at = new Date()): string {
	const tables = exportTables();
	return JSON.stringify(
		{
			app: "Ben's Tally",
			exportedAt: at.toISOString(),
			skipped: SKIPPED_TABLES,
			tables: Object.fromEntries(tables.map((t) => [t.name, t.rows]))
		},
		null,
		1
	);
}

/** One CSV per table, stored in a zip. JSON columns are written as JSON text. */
export function exportZip(at = new Date()): Buffer {
	const cell = (v: Value) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
	return zipStore(
		exportTables().map((t) => ({
			name: `${t.name}.csv`,
			data: toCsv([t.columns, ...t.rows.map((r) => t.columns.map((c) => cell(r[c])))])
		})),
		at
	);
}
