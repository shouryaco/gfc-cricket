CREATE TABLE `club_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`player_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `tournaments` ADD `public_enabled` integer DEFAULT 0 NOT NULL;