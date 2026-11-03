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

/* Calendar arithmetic on local 'YYYY-MM-DD' dates and 'YYYY-MM' months (no time zones involved). */

/** Days in a month, 'YYYY-MM'. */
export function daysInMonth(month: string): number {
	const [y, m] = month.split('-').map(Number);
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Last day of a month: '2026-02' → '2026-02-28'. */
export function monthEnd(month: string): string {
	return `${month}-${pad(daysInMonth(month))}`;
}

/** Same as monthEnd. */
export const lastDayOfMonth = monthEnd;

/** '2026-11' + 2 → '2027-01'. */
export function addMonths(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number);
	const total = y * 12 + (m - 1) + n;
	return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Whole months from a to b ('2026-01' → '2026-03' is 2). */
export function monthsBetween(a: string, b: string): number {
	const [ay, am] = a.split('-').map(Number);
	const [by, bm] = b.split('-').map(Number);
	return by * 12 + bm - (ay * 12 + am);
}

/** '2026-10-31' + 1 → '2026-11-01'. */
export function addDays(date: string, n: number): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The latest month whose end-of-month moment (23:59 local on its last day) has passed.
 * At 23:59 on 30 November this is "2026-11"; a minute earlier it is "2026-10".
 */
export function lastEndedMonth(at: Date = new Date(), hour = 23, minute = 59): string {
	const month = localMonth(at);
	const passed = localDate(at) === lastDayOfMonth(month) && localMinutes(at) >= hour * 60 + minute;
	return passed ? month : addMonths(month, -1);
}

/** "Nov 2026" (or "November 2026" with long). */
export function monthLabel(month: string, long = false): string {
	const [y, m] = month.split('-').map(Number);
	return new Intl.DateTimeFormat('en-AU', {
		month: long ? 'long' : 'short',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Days from a to b. */
export function daysBetween(a: string, b: string): number {
	const t = (s: string) => {
		const [y, m, d] = s.split('-').map(Number);
		return Date.UTC(y, m - 1, d);
	};
	return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Day of the week for a local date, 0 = Sunday. */
export function weekdayOf(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The same day of the month in another month, clamped to its length (31 Jan + 1 → 28 Feb). */
export function sameDayInMonth(month: string, day: number): string {
	return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** '2026-10' → 'October 2026'; { year: false } → 'October'. */
export function monthName(month: string, opts: { year?: boolean } = {}): string {
	const [y, m] = month.split('-').map(Number);
	return opts.year === false ? MONTH_NAMES[m - 1] : `${MONTH_NAMES[m - 1]} ${y}`;
}

/** '2026-10' → 'Oct 26'. */
export function shortMonth(month: string): string {
	const [y, m] = month.split('-').map(Number);
	return `${MONTH_NAMES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

/** '2026-10-31' → '31 Oct'; with year → '31 Oct 2026'. */
export function shortDate(date: string, opts: { year?: boolean } = {}): string {
	const [y, m, d] = date.split('-').map(Number);
	const base = `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
	return opts.year ? `${base} ${y}` : base;
}

/** Australian financial year (1 July to 30 June) holding a date: { label: '2026–27', start, end }. */
export function financialYear(date: string): { label: string; start: string; end: string } {
	const y = Number(date.slice(0, 4));
	const startYear = Number(date.slice(5, 7)) >= 7 ? y : y - 1;
	return {
		label: `${startYear}–${String((startYear + 1) % 100).padStart(2, '0')}`,
		start: `${startYear}-07-01`,
		end: `${startYear + 1}-06-30`
	};
}

/** '7 Oct' from 'YYYY-MM-DD'. */
export function shortDay(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Intl.DateTimeFormat('en-AU', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	}).format(Date.UTC(y, m - 1, d));
}

/** Whole years lived by `date` for someone born on `birth` ('YYYY-MM-DD'). */
export function ageOn(birth: string, date: string): number {
	const [by, bm, bd] = birth.split('-').map(Number);
	const [y, m, d] = date.split('-').map(Number);
	return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
