import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import path from 'node:path';

export const dataDir = path.resolve(env.DATA_DIR || './data');
export const dbPath = path.join(dataDir, 'tally.db');
export const backupDir = path.join(dataDir, 'backups');
export const migrationsDir = path.resolve(env.MIGRATIONS_DIR || './drizzle');
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
