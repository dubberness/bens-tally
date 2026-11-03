import { applyRules } from './engine';
import { log } from '../log';

/**
 * Called by the Up sync with the IDs of transactions it added or changed, so
 * rules can assign them. Hand assignments are left alone.
 */
export function onTransactionsSynced(ids: string[]): void {
	if (!ids.length) return;
	try {
		applyRules(ids);
	} catch (err) {
		log('error', 'Applying rules failed', {
			message: err instanceof Error ? err.message : String(err)
		});
	}
}
