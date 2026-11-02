import type { SheetArea } from './types';

export const budgetArea: SheetArea = {
	id: 'budget',
	label: 'Budget',
	pending: true,
	wipe: () => {},
	run: () => {}
};
