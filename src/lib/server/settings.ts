import { eq } from 'drizzle-orm';
import { db, schema } from './db';

export function getSetting<T>(key: string): T | undefined {
	const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
	return row ? (row.value as T) : undefined;
}

export function setSetting(key: string, value: unknown) {
	const updatedAt = new Date();
	db.insert(schema.settings)
		.values({ key, value, updatedAt })
		.onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt } })
		.run();
}
