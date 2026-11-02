/** All dates, month ends and jobs follow Hobart time, whatever the server's clock zone. */
export const TIME_ZONE = 'Australia/Hobart';

export interface LocalParts {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	weekday: number; // 0 = Sunday
}

const partsFormat = new Intl.DateTimeFormat('en-AU', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: 'numeric',
	weekday: 'short',
	hourCycle: 'h23'
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localParts(at: Date = new Date()): LocalParts {
	const p: Record<string, string> = {};
	for (const { type, value } of partsFormat.formatToParts(at)) p[type] = value;
	return {
		year: Number(p.year),
		month: Number(p.month),
		day: Number(p.day),
		hour: Number(p.hour),
		minute: Number(p.minute),
		weekday: WEEKDAYS.indexOf(p.weekday)
	};
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in Hobart. */
export function localDate(at: Date = new Date()): string {
	const p = localParts(at);
	return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** YYYY-MM in Hobart. */
export function localMonth(at: Date = new Date()): string {
	return localDate(at).slice(0, 7);
}

/** Minutes since local midnight, for "run after 2:30 am" style checks. */
export function localMinutes(at: Date = new Date()): number {
	const p = localParts(at);
	return p.hour * 60 + p.minute;
}

/** "Monday 2 November" */
export function longDay(at: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-AU', {
		timeZone: TIME_ZONE,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(at);
}

/** "2 Nov, 2:30 pm" */
export function shortDateTime(at: Date | number): string {
	return new Intl.DateTimeFormat('en-AU', {
		timeZone: TIME_ZONE,
		day: 'numeric',
		month: 'short',
		hour: 'numeric',
		minute: '2-digit'
	}).format(at);
}
