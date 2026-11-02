import { asc, isNotNull } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { listTransactions, transactionMonths } from '$lib/server/up/transactions';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const accountId = Number(url.searchParams.get('account')) || undefined;
	const monthParam = url.searchParams.get('month') ?? '';
	const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : undefined;
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

	const { rows, total } = listTransactions({
		accountId,
		month,
		search: q || undefined,
		limit: PAGE_SIZE,
		offset: (page - 1) * PAGE_SIZE
	});

	const accounts = db
		.select({ id: schema.accounts.id, name: schema.accounts.name })
		.from(schema.accounts)
		.where(isNotNull(schema.accounts.upAccountId))
		.orderBy(asc(schema.accounts.sortOrder), asc(schema.accounts.name))
		.all();

	return {
		filters: { q, accountId: accountId ?? null, month: month ?? '' },
		rows,
		total,
		page,
		pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		accounts,
		months: transactionMonths()
	};
};
