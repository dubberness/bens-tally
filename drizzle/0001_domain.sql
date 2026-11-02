CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`side` text NOT NULL,
	`source` text NOT NULL,
	`up_account_id` text,
	`colour` text,
	`icon` text,
	`investable` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`close_order` integer,
	`update_every_days` integer,
	`opened_on` text,
	`closed_on` text,
	`note` text,
	`origin` text DEFAULT 'app' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_up_account_id_unique` ON `accounts` (`up_account_id`);--> statement-breakpoint
CREATE INDEX `accounts_sort_idx` ON `accounts` (`sort_order`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`budget_line_id` integer,
	`rule_id` integer,
	`by_hand` integer DEFAULT false NOT NULL,
	`note` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`value_cents` integer NOT NULL,
	`source` text NOT NULL,
	`reestimate` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `balances_account_date_idx` ON `balances` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `budget_amounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`line_id` integer NOT NULL,
	`from_month` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`period` text NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `budget_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_amounts_line_month_idx` ON `budget_amounts` (`line_id`,`from_month`);--> statement-breakpoint
CREATE TABLE `budget_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`group` text NOT NULL,
	`saver_account_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`start_month` text,
	`end_month` text,
	`note` text,
	`origin` text DEFAULT 'app' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`saver_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `calculations` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`params` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `check_dismissals` (
	`key` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `distributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`date` text NOT NULL,
	`per_unit_e6` integer,
	`units_e6` integer,
	`amount_cents` integer NOT NULL,
	`franking_cents` integer,
	`reinvested` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`import_item_id` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_item_id`) REFERENCES `import_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `distributions_unique_idx` ON `distributions` (`instrument_id`,`date`);--> statement-breakpoint
CREATE TABLE `edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_key` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`reason` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `edits_entity_idx` ON `edits` (`entity`,`entity_key`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`account_id` integer,
	`key` text,
	`dismissed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_key_unique` ON `events` (`key`);--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`date`);--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`received_at` integer NOT NULL,
	`subject` text,
	`raw` text,
	`status` text NOT NULL,
	`result` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_items_source_ext_idx` ON `import_items` (`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`name` text,
	`exchange` text DEFAULT 'ASX' NOT NULL,
	`account_id` integer,
	`price_source` text DEFAULT 'yahoo' NOT NULL,
	`sheet_csv_url` text,
	`manual_price_e4` integer,
	`target_bp` integer,
	`distribution_frequency` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_ticker_unique` ON `instruments` (`ticker`);--> statement-breakpoint
CREATE TABLE `live_balances` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`value_cents` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pay_splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`note` text,
	`origin` text DEFAULT 'app' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prices` (
	`instrument_id` integer NOT NULL,
	`date` text NOT NULL,
	`close_e4` integer NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`instrument_id`, `date`),
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`match` text NOT NULL,
	`action` text NOT NULL,
	`budget_line_id` integer,
	`label` text,
	`origin` text DEFAULT 'app' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`params` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshot_values` (
	`month` text NOT NULL,
	`account_id` integer NOT NULL,
	`value_cents` integer NOT NULL,
	PRIMARY KEY(`month`, `account_id`),
	FOREIGN KEY (`month`) REFERENCES `snapshots`(`month`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`month` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`net_worth_cents` integer,
	`breakdown` text,
	`note` text,
	`origin` text DEFAULT 'app' NOT NULL,
	`locked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text,
	`discount_bp` integer NOT NULL,
	`holding_months` integer NOT NULL,
	`note` text,
	`origin` text DEFAULT 'app' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text,
	`instrument_id` integer NOT NULL,
	`date` text NOT NULL,
	`side` text NOT NULL,
	`units_e6` integer NOT NULL,
	`price_e4` integer NOT NULL,
	`value_cents` integer NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`import_item_id` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_item_id`) REFERENCES `import_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trades_order_id_unique` ON `trades` (`order_id`);--> statement-breakpoint
CREATE INDEX `trades_instrument_date_idx` ON `trades` (`instrument_id`,`date`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` integer,
	`up_account_id` text NOT NULL,
	`status` text NOT NULL,
	`description` text NOT NULL,
	`raw_text` text,
	`message` text,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	`settled_at` integer,
	`category` text,
	`parent_category` text,
	`tags` text,
	`transfer_up_account_id` text,
	`raw` text,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `yearly_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`yearly_cents` integer NOT NULL,
	`months` text NOT NULL,
	`budget_line_id` integer,
	`note` text,
	`origin` text DEFAULT 'app' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines`(`id`) ON UPDATE no action ON DELETE set null
);
