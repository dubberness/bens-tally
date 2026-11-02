import { env } from '$env/dynamic/private';

/**
 * A small read-only client for the Up API (https://developer.up.com.au/).
 * Only GET requests exist here: the app never moves money.
 */

export const UP_BASE_URL = 'https://api.up.com.au/api/v1';

/** The personal access token from the container's UP_TOKEN setting, or null. */
export function upToken(): string | null {
	const t = env.UP_TOKEN?.trim();
	return t ? t : null;
}

export type UpErrorKind = 'config' | 'auth' | 'rate' | 'http' | 'network' | 'timeout';

export class UpError extends Error {
	constructor(
		message: string,
		readonly kind: UpErrorKind,
		readonly status?: number
	) {
		super(message);
		this.name = 'UpError';
	}
}

interface Money {
	currencyCode: string;
	value: string;
	valueInBaseUnits: number;
}

interface Rel {
	data: { type: string; id: string } | null;
}

export interface UpAccount {
	type: 'accounts';
	id: string;
	attributes: {
		displayName: string;
		/** SAVER | TRANSACTIONAL | HOME_LOAN */
		accountType: string;
		/** INDIVIDUAL | JOINT */
		ownershipType: string;
		balance: Money;
		createdAt: string;
	};
}

export interface UpTransaction {
	type: 'transactions';
	id: string;
	attributes: {
		status: 'HELD' | 'SETTLED';
		rawText: string | null;
		description: string;
		message: string | null;
		amount: Money;
		foreignAmount: Money | null;
		roundUp: { amount: Money; boostPortion: Money | null } | null;
		cashback: { description: string; amount: Money } | null;
		settledAt: string | null;
		createdAt: string;
		transactionType?: string | null;
		[key: string]: unknown;
	};
	relationships: {
		account: Rel;
		transferAccount?: Rel;
		category?: Rel;
		parentCategory?: Rel;
		tags?: { data: { type: string; id: string }[] };
		[key: string]: unknown;
	};
}

interface Page<T> {
	data: T[];
	links?: { prev: string | null; next: string | null };
}

export interface UpClientOptions {
	token?: string | null;
	fetch?: typeof fetch;
	/** Per request. */
	timeoutMs?: number;
	baseUrl?: string;
	/** How long to wait before retrying; replaced in tests. */
	sleep?: (ms: number) => Promise<void>;
}

export interface TransactionQuery {
	/** RFC 3339; Up filters on createdAt. */
	since?: string;
	until?: string;
	status?: 'HELD' | 'SETTLED';
	pageSize?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createUpClient(opts: UpClientOptions = {}) {
	const token = opts.token === undefined ? upToken() : opts.token;
	const doFetch = opts.fetch ?? fetch;
	const timeoutMs = opts.timeoutMs ?? 30_000;
	const baseUrl = (opts.baseUrl ?? UP_BASE_URL).replace(/\/$/, '');
	const sleep = opts.sleep ?? realSleep;

	function urlFor(path: string, params: Record<string, string | number | undefined> = {}) {
		// `links.next` is absolute; never send the token anywhere but the API itself.
		const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path}`);
		if (!url.href.startsWith(`${baseUrl}/`))
			throw new UpError(`Refusing to call ${url.origin}: not the Up API`, 'config');
		for (const [k, v] of Object.entries(params))
			if (v !== undefined) url.searchParams.set(k, String(v));
		return url.href;
	}

	async function get<T>(
		path: string,
		params?: Record<string, string | number | undefined>
	): Promise<T> {
		if (!token) throw new UpError('The Up token (UP_TOKEN) is not set', 'config');
		const url = urlFor(path, params);
		for (let attempt = 0; ; attempt++) {
			let res: Response;
			try {
				res = await doFetch(url, {
					method: 'GET',
					headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
					signal: AbortSignal.timeout(timeoutMs)
				});
			} catch (err) {
				const timedOut =
					err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
				if (attempt < 2) {
					await sleep(1000 * (attempt + 1));
					continue;
				}
				throw timedOut
					? new UpError(`Up didn't answer within ${Math.round(timeoutMs / 1000)} s`, 'timeout')
					: new UpError(
							`Couldn't reach Up: ${err instanceof Error ? err.message : String(err)}`,
							'network'
						);
			}
			if (res.ok) return (await res.json()) as T;

			const detail = await errorDetail(res);
			if (res.status === 401)
				throw new UpError(
					'Up rejected the token (401). Make a new one and update UP_TOKEN.',
					'auth',
					401
				);
			if (res.status === 429) {
				if (attempt < 3) {
					const after = Number(res.headers.get('retry-after'));
					await sleep(
						Math.min(60, Number.isFinite(after) && after > 0 ? after : 5 * (attempt + 1)) * 1000
					);
					continue;
				}
				throw new UpError('Up is rate limiting requests (429); will try again later', 'rate', 429);
			}
			if (res.status >= 500 && attempt < 2) {
				await sleep(2000 * (attempt + 1));
				continue;
			}
			throw new UpError(
				`Up returned ${res.status}${detail ? `: ${detail}` : ''}`,
				'http',
				res.status
			);
		}
	}

	/** Every page of a list endpoint, following `links.next`. */
	async function* pages<T>(
		path: string,
		params?: Record<string, string | number | undefined>
	): AsyncGenerator<T[]> {
		let next: string | null = path;
		let first = true;
		while (next) {
			const page: Page<T> = await get<Page<T>>(next, first ? params : undefined);
			first = false;
			yield page.data;
			next = page.links?.next ?? null;
		}
	}

	async function all<T>(path: string, params?: Record<string, string | number | undefined>) {
		const out: T[] = [];
		for await (const p of pages<T>(path, params)) out.push(...p);
		return out;
	}

	return {
		get,
		pages,
		/** Checks the token. */
		ping: () => get<{ meta: { id: string; statusEmoji: string } }>('/util/ping'),
		accounts: () => all<UpAccount>('/accounts', { 'page[size]': 100 }),
		/** Newest first, one page (up to 100) at a time. */
		transactionPages: (q: TransactionQuery = {}) =>
			pages<UpTransaction>('/transactions', {
				'page[size]': q.pageSize ?? 100,
				'filter[since]': q.since,
				'filter[until]': q.until,
				'filter[status]': q.status
			})
	};
}

export type UpClient = ReturnType<typeof createUpClient>;

async function errorDetail(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { errors?: { title?: string; detail?: string }[] };
		return (body.errors ?? [])
			.map((e) => [e.title, e.detail].filter(Boolean).join(': '))
			.join('; ')
			.slice(0, 300);
	} catch {
		return '';
	}
}
