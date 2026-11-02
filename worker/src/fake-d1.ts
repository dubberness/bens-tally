/// <reference path="./types.d.ts" />
// A D1 stand-in over better-sqlite3, for tests only.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function fakeD1(): D1Database {
	const db = new Database(':memory:');
	db.exec(fs.readFileSync(path.resolve('worker/schema.sql'), 'utf8'));
	const stmt = (sql: string, vals: unknown[] = []): D1PreparedStatement => ({
		bind: (...v) => stmt(sql, v),
		first: async <T>() => (db.prepare(sql).get(...vals) as T) ?? null,
		all: async <T>() => ({ results: db.prepare(sql).all(...vals) as T[], meta: { changes: 0 } }),
		run: async () => ({ results: [], meta: { changes: db.prepare(sql).run(...vals).changes } })
	});
	return { prepare: (sql) => stmt(sql), batch: (ss) => Promise.all(ss.map((s) => s.run())) };
}
