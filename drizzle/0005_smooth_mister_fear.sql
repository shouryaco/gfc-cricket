CREATE TABLE `substitute_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`fielding_team` text NOT NULL,
	`player_id` text NOT NULL,
	`from_team` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
