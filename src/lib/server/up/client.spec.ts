import { vi } from 'vitest';

// Use this file's own empty database (DATA_DIR from test-setup); see the report about sharing.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));
import { describe, expect, it } from 'vitest';
import { createUpClient, UpError } from './client';

const BASE = 'https://api.example.test/api/v1';

function fakeFetch(routes: Record<string, () => Response>, calls: string[] = []) {
	return (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		calls.push(url);
		expect(init?.method).toBe('GET');
		expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
		const route = routes[url];
		if (!route) return new Response('not found', { status: 404 });
		return route();
	}) as typeof fetch;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});

const noSleep = async () => {};

describe('Up client', () => {
	it('follows links.next until the last page', async () => {
		const calls: string[] = [];
		const first = `${BASE}/transactions?page%5Bsize%5D=2`;
		const second = `${BASE}/transactions?page%5Bafter%5D=abc&page%5Bsize%5D=2`;
		const client = createUpClient({
			token: 'test-token',
			baseUrl: BASE,
			sleep: noSleep,
			fetch: fakeFetch(
				{
					[first]: () => json({ data: [{ id: 'a' }, { id: 'b' }], links: { next: second } }),
					[second]: () => json({ data: [{ id: 'c' }], links: { next: null } })
				},
				calls
			)
		});
		const ids: string[] = [];
		for await (const page of client.transactionPages({ pageSize: 2 }))
			ids.push(...page.map((t) => t.id));
		expect(ids).toEqual(['a', 'b', 'c']);
		expect(calls).toEqual([first, second]);
	});

	it('passes the since filter on the first request only', async () => {
		const calls: string[] = [];
		const client = createUpClient({
			token: 'test-token',
			baseUrl: BASE,
			fetch: (async (u: string) => {
				calls.push(String(u));
				return json({ data: [], links: { next: null } });
			}) as unknown as typeof fetch
		});
		for await (const page of client.transactionPages({ since: '2026-01-01T00:00:00.000Z' }))
			void page;
		expect(new URL(calls[0]).searchParams.get('filter[since]')).toBe('2026-01-01T00:00:00.000Z');
	});

	it('explains a rejected token', async () => {
		const client = createUpClient({
			token: 'test-token',
			baseUrl: BASE,
			fetch: fakeFetch({ [`${BASE}/util/ping`]: () => json({ errors: [] }, 401) })
		});
		const err = await client.ping().catch((e) => e);
		expect(err).toBeInstanceOf(UpError);
		expect(err.kind).toBe('auth');
		expect(err.message).toMatch(/token/);
	});

	it('refuses to run without a token', async () => {
		const client = createUpClient({ token: null, baseUrl: BASE });
		await expect(client.ping()).rejects.toMatchObject({ kind: 'config' });
	});

	it('retries after a 429 and then succeeds', async () => {
		let n = 0;
		const client = createUpClient({
			token: 'test-token',
			baseUrl: BASE,
			sleep: noSleep,
			fetch: fakeFetch({
				[`${BASE}/util/ping`]: () =>
					++n === 1
						? json({}, 429, { 'retry-after': '1' })
						: json({ meta: { id: 'x', statusEmoji: '⚡' } })
			})
		});
		await expect(client.ping()).resolves.toMatchObject({ meta: { id: 'x' } });
		expect(n).toBe(2);
	});

	it('never sends the token to another host', async () => {
		const client = createUpClient({
			token: 'test-token',
			baseUrl: BASE,
			fetch: fakeFetch({
				[`${BASE}/accounts?page%5Bsize%5D=100`]: () =>
					json({ data: [], links: { next: 'https://elsewhere.test/api/v1/accounts' } })
			})
		});
		await expect(client.accounts()).rejects.toMatchObject({ kind: 'config' });
	});
});
