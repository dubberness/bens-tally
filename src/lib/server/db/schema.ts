import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/** Typed key/value settings, edited in Manage. Values are JSON. */
export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** Signed-in browsers. Only a hash of the cookie token is stored. */
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		subject: text('subject').notNull(),
		name: text('name'),
		email: text('email'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
		userAgent: text('user_agent')
	},
	(t) => [index('sessions_expires_idx').on(t.expiresAt)]
);

/** One row per scheduled job run, shown in Manage. */
export const jobRuns = sqliteTable(
	'job_runs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		job: text('job').notNull(),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
		finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
		ok: integer('ok', { mode: 'boolean' }),
		message: text('message')
	},
	(t) => [index('job_runs_job_idx').on(t.job, t.startedAt)]
);
