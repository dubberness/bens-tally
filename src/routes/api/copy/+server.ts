import fs from 'node:fs';
import path from 'node:path';
import { sqlite } from '$lib/server/db';
import { dataDir } from '$lib/server/env';
import { localDate } from '$lib/time';
import type { RequestHandler } from './$types';

/** A fresh copy of the whole database, made with SQLite's online backup (safe while running). */
export const GET: RequestHandler = async () => {
	const dir = path.join(dataDir, 'tmp');
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `copy-${process.pid}-${Date.now()}.db`);
	try {
		await sqlite.backup(file);
		const body = fs.readFileSync(file);
		return new Response(body, {
			headers: {
				'content-type': 'application/vnd.sqlite3',
				'content-disposition': `attachment; filename="tally-${localDate()}.db"`,
				'content-length': String(body.length)
			}
		});
	} finally {
		fs.rmSync(file, { force: true });
	}
};
