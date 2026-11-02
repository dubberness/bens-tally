type Level = 'info' | 'warn' | 'error';

export function log(level: Level, msg: string, extra?: Record<string, unknown>) {
	const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`;
	const out = extra ? `${line} ${JSON.stringify(extra)}` : line;
	if (level === 'error') console.error(out);
	else if (level === 'warn') console.warn(out);
	else console.log(out);
}
