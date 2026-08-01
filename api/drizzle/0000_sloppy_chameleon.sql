CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`actor_role` text,
	`actor_email` text,
	`actor_name` text,
	`actor_designation` text,
	`district_name` text,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `districts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`district_name` text NOT NULL,
	`total_dues` real,
	`collected_till_date` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `districts_district_name_unique` ON `districts` (`district_name`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `magic_link_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_link_tokens_token_unique` ON `magic_link_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `pac_dues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`district_id` integer NOT NULL,
	`period` text NOT NULL,
	`opening_balance` real NOT NULL,
	`recovered_this_period` real DEFAULT 0,
	`batte_khatte_count` integer DEFAULT 0,
	`batte_khatte_amount` real DEFAULT 0,
	`court_case_count` integer DEFAULT 0,
	`court_stayed_amount` real DEFAULT 0,
	`net_recoverable` real NOT NULL,
	`lock_status` integer DEFAULT 0 NOT NULL,
	`locked_at` text,
	`submitted_by_name` text,
	`unlocked_at` text,
	`unlock_reason` text,
	`unlocked_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `district_period_unique` ON `pac_dues` (`district_id`,`period`);--> statement-breakpoint
CREATE TABLE `unlock_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`district_id` integer NOT NULL,
	`period` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	`admin_note` text,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text DEFAULT 'deo' NOT NULL,
	`email` text,
	`cug_hash` text,
	`district_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`name` text,
	`designation` text,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_cug_hash_unique` ON `users` (`cug_hash`);