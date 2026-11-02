import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import { dataDir, dbPath, migrationsDir } from '../env';
import * as schema from './schema';

function open() {
	fs.mkdirSync(dataDir, { recursive: true });
	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: migrationsDir });
	return { sqlite, db };
}

// Keep one connection across Vite hot reloads in development.
const g = globalThis as unknown as { __tallyDb?: ReturnType<typeof open> };
const conn = (g.__tallyDb ??= open());

export const sqlite = conn.sqlite;
export const db = conn.db;
export { schema };
