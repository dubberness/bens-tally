import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Runs e2e/seed.spec.ts once to fill the database in DATA_DIR. Kept apart from the unit
// tests (whose setup gives every file an empty temporary database).
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['e2e/seed.spec.ts'],
		environment: 'node',
		setupFiles: ['e2e/seed-setup.ts']
	}
});
