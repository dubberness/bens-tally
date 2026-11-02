/**
 * Called by the Up sync with the IDs of transactions it added or changed, so
 * rules can assign them. Filled in by the budget work.
 */
export function onTransactionsSynced(ids: string[]): void {
	void ids;
}
