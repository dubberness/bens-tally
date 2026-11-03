// Starts the app for the browser tests: builds it, fills a fresh temporary data folder with
// the made-up household in e2e/seed.spec.ts, then serves it. Playwright runs this for you.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = process.env.E2E_PORT || '5187';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tally-e2e-'));
const run = (cmd, args, env = {}) => {
	const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
	if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npm', ['run', 'build']);
run('npm', ['run', 'e2e:seed'], { DATA_DIR: dataDir });

const server = spawn('node', ['build'], {
	stdio: 'inherit',
	env: {
		...process.env,
		DATA_DIR: dataDir,
		MIGRATIONS_DIR: path.resolve('drizzle'),
		PORT: port,
		HOST: '127.0.0.1',
		ORIGIN: `http://127.0.0.1:${port}`,
		// Nothing should reach the internet or run on a timer while the tests look around.
		DISABLE_JOBS: '1',
		// Made-up tokens for the test browser to send; they exist only for this run.
		API_READ_TOKEN: process.env.E2E_READ_TOKEN || 'e2e-read-token-0123456789abcdef0123456789',
		API_WRITE_TOKEN: process.env.E2E_WRITE_TOKEN || 'e2e-write-token-0123456789abcdef012345678'
	}
});

const stop = () => {
	server.kill('SIGTERM');
	fs.rmSync(dataDir, { recursive: true, force: true });
};
process.on('SIGINT', () => (stop(), process.exit(0)));
process.on('SIGTERM', () => (stop(), process.exit(0)));
server.on('exit', (code) => {
	fs.rmSync(dataDir, { recursive: true, force: true });
	process.exit(code ?? 0);
});
