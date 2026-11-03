import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import path from 'node:path';

// process.env as well: under vitest $env/dynamic/private doesn't see variables set by the test setup.
export const dataDir = path.resolve(env.DATA_DIR || process.env.DATA_DIR || './data');
export const dbPath = path.join(dataDir, 'tally.db');
export const backupDir = path.join(dataDir, 'backups');
export const migrationsDir = path.resolve(
	env.MIGRATIONS_DIR || process.env.MIGRATIONS_DIR || './drizzle'
);
export const buildSha = env.BUILD_SHA || 'dev';

export const oidc = {
	issuer: env.OIDC_ISSUER || '',
	clientId: env.OIDC_CLIENT_ID || '',
	clientSecret: env.OIDC_CLIENT_SECRET || '',
	allowedSubjects: (env.OIDC_ALLOWED_SUBJECTS || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
};

/** Only honoured by `vite dev`; a production build never skips the login. */
export const skipLogin = dev && env.DEV_SKIP_LOGIN === '1';

/** The mail Worker the Betashares emails are collected from; both empty = not set up. */
export const mailWorker = {
	url: (env.WORKER_URL || process.env.WORKER_URL || '').trim().replace(/\/+$/, ''),
	token: (env.WORKER_TOKEN || process.env.WORKER_TOKEN || '').trim()
};

/**
 * Bearer tokens for scripted access on the home network (Claude): one that can only read,
 * one that can also change things through the app's own forms. Empty = off.
 */
export const apiTokens = {
	read: (env.API_READ_TOKEN || process.env.API_READ_TOKEN || '').trim(),
	write: (env.API_WRITE_TOKEN || process.env.API_WRITE_TOKEN || '').trim()
};
