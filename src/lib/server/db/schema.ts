import {
	sqliteTable,
	text,
	integer,
	index,
	uniqueIndex,
	primaryKey
} from 'drizzle-orm/sqlite-core';

/** Typed key/value settings, edited in Manage. Values are JSON. */
export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** Signed-in browsers. Only a hash of the cookie token is stored. */
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		subject: text('subject').notNull(),
		name: text('name'),
		email: text('email'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
		userAgent: text('user_agent')
	},
	(t) => [index('sessions_expires_idx').on(t.expiresAt)]
);

/** One row per scheduled job run, shown in Manage. */
export const jobRuns = sqliteTable(
	'job_runs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		job: text('job').notNull(),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
		finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
		ok: integer('ok', { mode: 'boolean' }),
		message: text('message')
	},
	(t) => [index('job_runs_job_idx').on(t.job, t.startedAt)]
);

/*
 * Money is integer cents. Units are integer millionths (unitsE6) and unit prices
 * integer ten-thousandths of a dollar (priceE4). Dates are local Hobart 'YYYY-MM-DD'
 * text and months 'YYYY-MM'. Nothing personal is seeded here: every row is made in
 * the app or by the sheet import.
 */

/** Anything with a value: Up savers, the ETF portfolio, super, the home, each loan. */
export const accounts = sqliteTable(
	'accounts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		/** cash | investment | super | property | loan | other */
		kind: text('kind').notNull(),
		/** asset | liability */
		side: text('side').notNull(),
		/** up | betashares | manual | calculated */
		source: text('source').notNull(),
		/** Up's account ID once matched. */
		upAccountId: text('up_account_id').unique(),
		colour: text('colour'),
		icon: text('icon'),
		investable: integer('investable', { mode: 'boolean' }).notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		/** Position on the Close the month screen; null keeps it off that screen. */
		closeOrder: integer('close_order'),
		/** A check fires when a manual account goes this long without a new balance. */
		updateEveryDays: integer('update_every_days'),
		openedOn: text('opened_on'),
		closedOn: text('closed_on'),
		note: text('note'),
		/** 'sheet' when made by the sheet import (wiped on a re-run), else 'app'. */
		origin: text('origin').notNull().default('app'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('accounts_sort_idx').on(t.sortOrder)]
);

/** How a calculated account gets its value, e.g. a share of another account or an amortised loan. */
export const calculations = sqliteTable('calculations', {
	accountId: integer('account_id')
		.primaryKey()
		.references(() => accounts.id, { onDelete: 'cascade' }),
	/** share_of | amortised */
	kind: text('kind').notNull(),
	params: text('params', { mode: 'json' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** A dated value for an account: manual entries, month-end readings, sheet history. */
export const balances = sqliteTable(
	'balances',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		accountId: integer('account_id')
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		valueCents: integer('value_cents').notNull(),
		/** manual | month_end | sheet | calculated */
		source: text('source').notNull(),
		/** A change of estimate (home value), shown apart from real money. */
		reestimate: integer('reestimate', { mode: 'boolean' }).notNull().default(false),
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('balances_account_date_idx').on(t.accountId, t.date)]
);

/** Latest live balance per Up account, refreshed by the Up sync. */
export const liveBalances = sqliteTable('live_balances', {
	accountId: integer('account_id')
		.primaryKey()
		.references(() => accounts.id, { onDelete: 'cascade' }),
	valueCents: integer('value_cents').notNull(),
	fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull()
});

/** One per month. Locked months change only through recorded edits. */
export const snapshots = sqliteTable('snapshots', {
	month: text('month').primaryKey(),
	/** open | locked */
	status: text('status').notNull(),
	netWorthCents: integer('net_worth_cents'),
	/** The change against the previous locked month, by part, fixed when locked. */
	breakdown: text('breakdown', { mode: 'json' }),
	note: text('note'),
	/** sheet | app */
	origin: text('origin').notNull().default('app'),
	lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const snapshotValues = sqliteTable(
	'snapshot_values',
	{
		month: text('month')
			.notNull()
			.references(() => snapshots.month, { onDelete: 'cascade' }),
		accountId: integer('account_id')
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		valueCents: integer('value_cents').notNull()
	},
	(t) => [primaryKey({ columns: [t.month, t.accountId] })]
);

/** History of corrections to locked snapshots, trades and distributions. */
export const edits = sqliteTable(
	'edits',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** snapshot | trade | distribution | balance */
		entity: text('entity').notNull(),
		entityKey: text('entity_key').notNull(),
		field: text('field').notNull(),
		oldValue: text('old_value'),
		newValue: text('new_value'),
		reason: text('reason'),
		at: integer('at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('edits_entity_idx').on(t.entity, t.entityKey)]
);

/** A held or once-held fund. */
export const instruments = sqliteTable('instruments', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	ticker: text('ticker').notNull().unique(),
	name: text('name'),
	exchange: text('exchange').notNull().default('ASX'),
	/** The investment account it counts toward. */
	accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
	/** yahoo | sheet_csv | manual */
	priceSource: text('price_source').notNull().default('yahoo'),
	sheetCsvUrl: text('sheet_csv_url'),
	/** Overrides every feed while set. */
	manualPriceE4: integer('manual_price_e4'),
	/** Target share of the portfolio in basis points; null = no target. */
	targetBp: integer('target_bp'),
	/** monthly | quarterly | half-yearly | yearly */
	distributionFrequency: text('distribution_frequency'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const trades = sqliteTable(
	'trades',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Betashares order ID when known; unique so emails and CSV rows never double up. */
		orderId: text('order_id').unique(),
		instrumentId: integer('instrument_id')
			.notNull()
			.references(() => instruments.id),
		date: text('date').notNull(),
		/** buy | sell */
		side: text('side').notNull(),
		unitsE6: integer('units_e6').notNull(),
		priceE4: integer('price_e4').notNull(),
		valueCents: integer('value_cents').notNull(),
		feeCents: integer('fee_cents').notNull().default(0),
		/** email | csv | manual | sheet */
		source: text('source').notNull(),
		importItemId: integer('import_item_id').references(() => importItems.id, {
			onDelete: 'set null'
		}),
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('trades_instrument_date_idx').on(t.instrumentId, t.date)]
);

export const distributions = sqliteTable(
	'distributions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		instrumentId: integer('instrument_id')
			.notNull()
			.references(() => instruments.id),
		/** Payment date. */
		date: text('date').notNull(),
		perUnitE6: integer('per_unit_e6'),
		unitsE6: integer('units_e6'),
		amountCents: integer('amount_cents').notNull(),
		frankingCents: integer('franking_cents'),
		reinvested: integer('reinvested', { mode: 'boolean' }).notNull().default(false),
		/** email | csv | manual | sheet */
		source: text('source').notNull(),
		importItemId: integer('import_item_id').references(() => importItems.id, {
			onDelete: 'set null'
		}),
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [uniqueIndex('distributions_unique_idx').on(t.instrumentId, t.date)]
);

/** One row per ticker per day; today's row is overwritten by delayed quotes until the close. */
export const prices = sqliteTable(
	'prices',
	{
		instrumentId: integer('instrument_id')
			.notNull()
			.references(() => instruments.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		closeE4: integer('close_e4').notNull(),
		/** yahoo | sheet_csv | manual | email */
		source: text('source').notNull(),
		fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.instrumentId, t.date] })]
);

/** Read-only mirror of Up transactions. Ben's own labels live in assignments. */
export const transactions = sqliteTable(
	'transactions',
	{
		id: text('id').primaryKey(),
		accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
		upAccountId: text('up_account_id').notNull(),
		/** HELD | SETTLED */
		status: text('status').notNull(),
		description: text('description').notNull(),
		rawText: text('raw_text'),
		message: text('message'),
		amountCents: integer('amount_cents').notNull(),
		/** Local date of createdAt. */
		date: text('date').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		settledAt: integer('settled_at', { mode: 'timestamp_ms' }),
		category: text('category'),
		parentCategory: text('parent_category'),
		tags: text('tags', { mode: 'json' }).$type<string[]>(),
		/** Set when Up marks this as a transfer between Ben's own accounts. */
		transferUpAccountId: text('transfer_up_account_id'),
		raw: text('raw', { mode: 'json' }),
		syncedAt: integer('synced_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [
		index('transactions_date_idx').on(t.date),
		index('transactions_account_idx').on(t.accountId, t.date)
	]
);

/** Ordered matching rules; the first enabled match wins. */
export const rules = sqliteTable('rules', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	/** { merchant?, description?, category?, accountId?, tag?, minCents?, maxCents? } */
	match: text('match', { mode: 'json' }).notNull(),
	/** budget | other_person | transfer | income | one_off | investing | repayment */
	action: text('action').notNull(),
	budgetLineId: integer('budget_line_id').references(() => budgetLines.id, {
		onDelete: 'set null'
	}),
	/** Groups "paid for someone else" rules under a name, e.g. whose shop it was. */
	label: text('label'),
	origin: text('origin').notNull().default('app'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** What a transaction counts as. A hand choice (byHand) beats any rule. */
export const assignments = sqliteTable('assignments', {
	transactionId: text('transaction_id')
		.primaryKey()
		.references(() => transactions.id, { onDelete: 'cascade' }),
	action: text('action').notNull(),
	budgetLineId: integer('budget_line_id').references(() => budgetLines.id, {
		onDelete: 'set null'
	}),
	ruleId: integer('rule_id').references(() => rules.id, { onDelete: 'set null' }),
	byHand: integer('by_hand', { mode: 'boolean' }).notNull().default(false),
	note: text('note'),
	at: integer('at', { mode: 'timestamp_ms' }).notNull()
});

export const budgetLines = sqliteTable('budget_lines', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	/** bills | living | fun | savings | investing */
	group: text('group').notNull(),
	/** The Up saver it is paid from. */
	saverAccountId: integer('saver_account_id').references(() => accounts.id, {
		onDelete: 'set null'
	}),
	sortOrder: integer('sort_order').notNull().default(0),
	startMonth: text('start_month'),
	endMonth: text('end_month'),
	note: text('note'),
	origin: text('origin').notNull().default('app'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** Amount history per line, so old months compare against the plan of the time. */
export const budgetAmounts = sqliteTable(
	'budget_amounts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		lineId: integer('line_id')
			.notNull()
			.references(() => budgetLines.id, { onDelete: 'cascade' }),
		fromMonth: text('from_month').notNull(),
		amountCents: integer('amount_cents').notNull(),
		/** week | month | year */
		period: text('period').notNull()
	},
	(t) => [uniqueIndex('budget_amounts_line_month_idx').on(t.lineId, t.fromMonth)]
);

export const yearlyBills = sqliteTable('yearly_bills', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	yearlyCents: integer('yearly_cents').notNull(),
	/** Usual months, 1–12. */
	months: text('months', { mode: 'json' }).$type<number[]>().notNull(),
	budgetLineId: integer('budget_line_id').references(() => budgetLines.id, {
		onDelete: 'set null'
	}),
	note: text('note'),
	origin: text('origin').notNull().default('app'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** The planned amount sent to each saver per pay. */
export const paySplits = sqliteTable('pay_splits', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	accountId: integer('account_id')
		.notNull()
		.references(() => accounts.id, { onDelete: 'cascade' }),
	amountCents: integer('amount_cents').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	note: text('note'),
	origin: text('origin').notNull().default('app'),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** "Coming up" items; some are suggested by the app (key set, so they aren't made twice). */
export const events = sqliteTable(
	'events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		date: text('date').notNull(),
		title: text('title').notNull(),
		note: text('note'),
		accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
		/** Stable key for app-suggested events, e.g. 'parcel:12:2027-04-03'. */
		key: text('key').unique(),
		dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('events_date_idx').on(t.date)]
);

/** FIRE assumptions: one default plus saved what-ifs. */
export const scenarios = sqliteTable('scenarios', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
	params: text('params', { mode: 'json' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** Capital gains rules by date, so a law change is a new row, not new code. */
export const taxRules = sqliteTable('tax_rules', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	fromDate: text('from_date').notNull(),
	toDate: text('to_date'),
	/** Discount on gains from parcels held longer than holdingMonths, in basis points. */
	discountBp: integer('discount_bp').notNull(),
	holdingMonths: integer('holding_months').notNull(),
	note: text('note'),
	origin: text('origin').notNull().default('app'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** Everything that came in from outside: emails, CSV rows, sheet imports. The Inbox. */
export const importItems = sqliteTable(
	'import_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** email | csv | sheet */
		source: text('source').notNull(),
		/** Worker record ID, CSV row key and so on; unique per source. */
		externalId: text('external_id'),
		receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
		subject: text('subject'),
		raw: text('raw'),
		/** applied | review | ignored */
		status: text('status').notNull(),
		result: text('result', { mode: 'json' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [uniqueIndex('import_items_source_ext_idx').on(t.source, t.externalId)]
);

/** Checks Ben dismissed; one comes back when its fingerprint (the numbers) changes. */
export const checkDismissals = sqliteTable('check_dismissals', {
	key: text('key').primaryKey(),
	fingerprint: text('fingerprint').notNull(),
	at: integer('at', { mode: 'timestamp_ms' }).notNull()
});
