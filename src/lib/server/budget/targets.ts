import { ACTIONS, type Action } from '$lib/budget/rules';
import type { Target } from './engine';

/**
 * A choice in the "count this as" menus, written as one string so a plain form can
 * carry it: "budget:12", "other_person:Name", "transfer", "income", "one_off"…
 */
export function parseTarget(value: string, newLabel = ''): Target | string {
	const [action, ...rest] = value.split(':');
	const arg = rest.join(':');
	if (!(ACTIONS as readonly string[]).includes(action)) return 'Pick what it counts as';
	if (action === 'budget') {
		const id = Number(arg);
		return id > 0 ? { action, budgetLineId: id } : 'Pick a budget line';
	}
	if (action === 'other_person') {
		const label = (arg || newLabel).trim();
		return label ? { action, label } : 'Say whose it is';
	}
	return { action: action as Action };
}
