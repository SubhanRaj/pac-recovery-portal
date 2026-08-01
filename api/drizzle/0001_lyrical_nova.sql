ALTER TABLE `pac_dues` ADD `rc_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `pac_dues` ADD `rc_amount` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `pac_dues` ADD `rc_details` text DEFAULT '[]';