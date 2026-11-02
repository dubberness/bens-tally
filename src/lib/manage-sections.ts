/** The pages under Manage, in the order they're listed. */
export const manageSections = [
	{ href: '/manage/accounts', label: 'Accounts', sub: 'Add, edit, close, reorder; calculations' },
	{ href: '/manage/events', label: 'Coming up', sub: 'Dates to remember' },
	{ href: '/manage/up', label: 'Up Bank', sub: 'Connection, account matching, sync' },
	{
		href: '/manage/instruments',
		label: 'Funds and targets',
		sub: 'Tickers, price sources, target mix'
	},
	{ href: '/manage/tax', label: 'Tax rules', sub: 'Capital gains discount and holding period' },
	{ href: '/manage/inbox', label: 'Inbox and CSV', sub: 'Emails to review, Betashares CSV upload' },
	{ href: '/manage/rules', label: 'Rules', sub: 'How transactions are sorted' },
	{ href: '/manage/settings', label: 'Settings', sub: 'Payday, investable accounts, birth date' },
	{
		href: '/manage/import',
		label: 'Sheet import',
		sub: 'Load history from the Personal Wealth sheet'
	}
] as const;
