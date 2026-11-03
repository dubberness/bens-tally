import path from 'node:path';
import { vi } from 'vitest';

// The seed writes to the DATA_DIR it is given, never a temporary one.
if (!process.env.DATA_DIR) throw new Error('Set DATA_DIR to the folder the seed should fill');
process.env.MIGRATIONS_DIR = path.resolve('drizzle');
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
