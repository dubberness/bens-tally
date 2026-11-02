// The parts of the Workers runtime this Worker uses, so it type-checks without extra packages.

interface D1Result<T = Record<string, unknown>> {
	results: T[];
	meta: { changes: number };
}
interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
	run(): Promise<D1Result>;
}
interface D1Database {
	prepare(sql: string): D1PreparedStatement;
	batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface ForwardableEmailMessage {
	readonly from: string;
	readonly to: string;
	readonly raw: ReadableStream<Uint8Array>;
	readonly rawSize: number;
	readonly headers: Headers;
	setReject(reason: string): void;
}

interface ExecutionContext {
	waitUntil(p: Promise<unknown>): void;
}

interface ScheduledController {
	readonly scheduledTime: number;
	readonly cron: string;
}
