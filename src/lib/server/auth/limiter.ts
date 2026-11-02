/** A small in-memory limiter for sign-in attempts per address. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const hits = new Map<string, number[]>();

export function allowAttempt(key: string, now = Date.now()): boolean {
	const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (recent.length >= MAX_ATTEMPTS) {
		hits.set(key, recent);
		return false;
	}
	recent.push(now);
	hits.set(key, recent);
	return true;
}
