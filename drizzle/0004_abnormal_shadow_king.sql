CREATE TABLE `delivery_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`match_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scorer_leases` (
	`match_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `tournaments` ADD `overs` integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `bowler_limit` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `two_team_matches` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `win_points` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `tie_points` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `no_result_points` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `automatic_toss_choice` integer DEFAULT 0 NOT NULL;