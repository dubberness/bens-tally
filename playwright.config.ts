import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT || '5187';

// The tokens only exist for the test server that e2e/serve.mjs starts.
export const WRITE_TOKEN =
	process.env.E2E_WRITE_TOKEN || 'e2e-write-token-0123456789abcdef012345678';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '*.e2e.ts',
	// One browser at a time: the tests share one server and one database.
	workers: 1,
	fullyParallel: false,
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		extraHTTPHeaders: { Authorization: `Bearer ${WRITE_TOKEN}` },
		launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined }
	},
	webServer: {
		command: 'node e2e/serve.mjs',
		url: `http://127.0.0.1:${port}/api/health`,
		timeout: 120_000,
		reuseExistingServer: false
	}
});
