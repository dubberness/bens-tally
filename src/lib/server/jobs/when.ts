import { localDate, localMinutes } from '$lib/time';

/** Runs once a day after the given local time; catches up if the app was down at that time. */
export const dailyAfter =
	(hour: number, minute: number) =>
	(now: Date, lastOk: Date | null): boolean =>
		localMinutes(now) >= hour * 60 + minute && (!lastOk || localDate(lastOk) < localDate(now));

/** Runs when at least `minutes` have passed since the last success. */
export const every =
	(minutes: number) =>
	(now: Date, lastOk: Date | null): boolean =>
		!lastOk || now.getTime() - lastOk.getTime() >= minutes * 60_000 - 5_000;

/** Monday to Friday, local time. */
export const isWeekday = (now: Date): boolean => {
	const wd = new Intl.DateTimeFormat('en-AU', {
		timeZone: 'Australia/Hobart',
		weekday: 'short'
	}).format(now);
	return wd !== 'Sat' && wd !== 'Sun';
};
