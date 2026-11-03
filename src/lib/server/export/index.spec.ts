import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema, sqlite } from '../db';
import { setSetting } from '../settings';
import { exportJson, exportName, exportTables, exportZip, SKIPPED_TABLES } from './index';

const now = new Date('2026-03-04T05:06:07.000Z');

beforeAll(() => {
	const account = db
		.insert(schema.accounts)
		.values({
			name: 'Test, "quoted" account',
			kind: 'cash',
			side: 'asset',
			source: 'manual',
			investable: true,
			createdAt: now,
			updatedAt: now
		})
		.returning()
		.get();
	db.insert(schema.calculations)
		.values({ accountId: account.id, kind: 'share_of', params: { shareBp: 1250 }, updatedAt: now })
		.run();
	setSetting('owner', { subject: 'someone', name: 'Someone', email: 'someone@example.com' });
	setSetting('prefs.theme', 'light');
	db.insert(schema.sessions)
		.values({
			id: 'hash-of-cookie',
			subject: 'someone',
			createdAt: now,
			expiresAt: now,
			lastSeenAt: now
		})
		.run();
});

describe('export everything', () => {
	it('covers every table in the database except the ones skipped on purpose', () => {
		const inDb = (
			sqlite
				.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
				.all() as { name: string }[]
		)
			.map((t) => t.name)
			.filter((n) => !n.startsWith('__drizzle'));
		const exported = exportTables().map((t) => t.name);
		expect(exported.sort()).toEqual(inDb.filter((n) => !(n in SKIPPED_TABLES)).sort());
	});

	it('leaves out sessions and the sign-in owner', () => {
		const json = exportJson(now);
		expect(json).not.toContain('hash-of-cookie');
		expect(json).not.toContain('someone@example.com');
		const doc = JSON.parse(json);
		expect(doc.tables.sessions).toBeUndefined();
		expect(doc.tables.settings.map((r: { key: string }) => r.key)).toEqual(['prefs.theme']);
	});

	it('writes timestamps as ISO text, booleans as booleans and JSON as JSON', () => {
		const doc = JSON.parse(exportJson(now));
		const [acc] = doc.tables.accounts;
		expect(acc.created_at).toBe('2026-03-04T05:06:07.000Z');
		expect(acc.investable).toBe(true);
		expect(acc.closed_on).toBeNull();
		expect(doc.tables.calculations[0].params).toEqual({ shareBp: 1250 });
		expect(doc.exportedAt).toBe(now.toISOString());
	});

	it('zips one CSV per table with a header row and quoted cells', () => {
		const files = unzipSync(new Uint8Array(exportZip(now)));
		expect(Object.keys(files)).toContain('accounts.csv');
		expect(Object.keys(files)).not.toContain('sessions.csv');
		const accounts = strFromU8(files['accounts.csv']).split('\n');
		expect(accounts[0].startsWith('id,name,kind,side,source')).toBe(true);
		expect(accounts[1]).toContain('"Test, ""quoted"" account"');
		expect(strFromU8(files['calculations.csv'])).toContain('"{""shareBp"":1250}"');
		// Tables with no rows still get their header
		expect(strFromU8(files['trades.csv']).split('\n')[0]).toContain('instrument_id');
	});

	it('names files by the local date', () => {
		expect(exportName('json', new Date('2026-03-04T05:06:07Z'))).toBe(
			'tally-export-2026-03-04.json'
		);
		expect(exportName('zip', new Date('2026-03-04T05:06:07Z'))).toBe('tally-export-2026-03-04.zip');
	});
});
