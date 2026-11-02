export interface Job {
	id: string;
	label: string;
	when: string;
	/** Is the job due, given when it last succeeded? Checked once a minute. */
	due: (now: Date, lastOk: Date | null) => boolean;
	run: (now: Date) => Promise<string> | string;
}
