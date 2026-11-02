import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every test file that touches the database gets its own empty one, migrated on first use.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tally-test-'));
process.env.MIGRATIONS_DIR = path.resolve('drizzle');

// SvelteKit fills $env/dynamic/private before this file runs, so point it at process.env
// to make the per-file DATA_DIR above take effect (otherwise every file shares ./data).
import { vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
