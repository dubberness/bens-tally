export interface Check {
	/** Stable per problem, e.g. 'invest:target-not-held:ARMR'. */
	key: string;
	/** info | warn */
	level: 'info' | 'warn';
	message: string;
	/** Where the one-tap fix lives. */
	fixHref?: string;
	fixLabel?: string;
	/** Changes when the underlying numbers change, which brings back a dismissed check. */
	fingerprint: string;
}

/** Reads current data and returns any problems. Must be quick and must not write. */
export type CheckSource = () => Check[];
