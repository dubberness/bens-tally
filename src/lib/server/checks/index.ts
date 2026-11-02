import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { log } from '../log';
import type { Check } from './types';
import { historyChecks } from '../history/checks';
import { upChecks } from '../up/checks';
import { investChecks } from '../invest/checks';
import { budgetChecks } from '../budget/checks';

export type { Check };

const sources = [...historyChecks, ...upChecks, ...investChecks, ...budgetChecks];

/** Every current check; dismissed ones are left out unless their numbers changed. */
export function runChecks({ includeDismissed = false } = {}): Check[] {
	const dismissed = new Map(
		db
			.select()
			.from(schema.checkDismissals)
			.all()
			.map((d) => [d.key, d.fingerprint])
	);
	const out: Check[] = [];
	for (const source of sources) {
		try {
			for (const c of source()) {
				if (includeDismissed || dismissed.get(c.key) !== c.fingerprint) out.push(c);
			}
		} catch (err) {
			log('error', 'Check failed', { message: err instanceof Error ? err.message : String(err) });
		}
	}
	return out;
}

export function dismissCheck(key: string, fingerprint: string) {
	db.insert(schema.checkDismissals)
		.values({ key, fingerprint, at: new Date() })
		.onConflictDoUpdate({
			target: schema.checkDismissals.key,
			set: { fingerprint, at: new Date() }
		})
		.run();
}

export function undismissCheck(key: string) {
	db.delete(schema.checkDismissals).where(eq(schema.checkDismissals.key, key)).run();
}
