DROP INDEX `district_period_unique`;--> statement-breakpoint
ALTER TABLE `pac_dues` DROP COLUMN `period`;--> statement-breakpoint
ALTER TABLE `pac_dues` DROP COLUMN `lock_status`;--> statement-breakpoint
ALTER TABLE `pac_dues` DROP COLUMN `locked_at`;--> statement-breakpoint
ALTER TABLE `pac_dues` DROP COLUMN `unlocked_at`;--> statement-breakpoint
ALTER TABLE `pac_dues` DROP COLUMN `unlock_reason`;--> statement-breakpoint
ALTER TABLE `pac_dues` DROP COLUMN `unlocked_by`;--> statement-breakpoint
ALTER TABLE `unlock_requests` DROP COLUMN `period`;