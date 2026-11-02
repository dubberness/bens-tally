import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';

export type NewAccount = Omit<typeof schema.accounts.$inferInsert, 'createdAt' | 'updatedAt'>;

/**
 * The open account with this name (case-insensitive, same kind), or a new one.
 * The sheet import, the budget import and the Up sync all use this, so a saver
 * named the same in each place ends up as one account.
 */
export function findOrCreateAccount(values: NewAccount) {
	const found = db
		.select()
		.from(schema.accounts)
		.where(
			and(
				sql`lower(${schema.accounts.name}) = lower(${values.name.trim()})`,
				eq(schema.accounts.kind, values.kind)
			)
		)
		.get();
	if (found) return found;
	const now = new Date();
	return db
		.insert(schema.accounts)
		.values({ ...values, name: values.name.trim(), createdAt: now, updatedAt: now })
		.returning()
		.get();
}
