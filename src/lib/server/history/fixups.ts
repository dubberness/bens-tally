import { log } from '../log';
import { boughtFromTrades } from './bought-from-trades';

export const BOUGHT_FIXUP_REASON = 'Bought ETFs now from trade dates';

/**
 * Corrections to data an earlier version of the app stored, run when the server starts.
 * Each one only touches rows still in the old shape, so running them again changes
 * nothing, and none of them stops the server from starting.
 */
export function runFixups() {
	try {
		const changed = boughtFromTrades(BOUGHT_FIXUP_REASON);
		if (changed.length)
			log('info', `Moved Bought ETFs to trade dates for ${changed.length} months`);
	} catch (err) {
		log('error', 'Bought ETFs fix-up failed', {
			message: err instanceof Error ? err.message : String(err)
		});
	}
}
