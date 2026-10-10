CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `availability` (
	`session_id` text NOT NULL,
	`player_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_availability_session_player` ON `availability` (`session_id`,`player_id`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`innings` integer NOT NULL,
	`sequence` integer NOT NULL,
	`striker_id` text NOT NULL,
	`nonstriker_id` text NOT NULL,
	`bowler_id` text NOT NULL,
	`bat_runs` integer DEFAULT 0 NOT NULL,
	`extra_type` text DEFAULT 'none' NOT NULL,
	`extra_runs` integer DEFAULT 0 NOT NULL,
	`wicket` integer DEFAULT 0 NOT NULL,
	`dismissed_id` text,
	`wicket_type` text,
	`fielder_id` text,
	`legal` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_match_sequence` ON `deliveries` (`match_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`number` integer NOT NULL,
	`stage` text NOT NULL,
	`team_a` text,
	`team_b` text,
	`resting` text,
	`overs` integer DEFAULT 8 NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`toss_winner` text,
	`toss_choice` text,
	`batting_first` text,
	`winner` text,
	`result` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`striker_id` text,
	`nonstriker_id` text,
	`bowler_id` text,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_match_tournament_number` ON `matches` (`tournament_id`,`number`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`grade` text NOT NULL,
	`role` text NOT NULL,
	`batting` integer NOT NULL,
	`bowling` integer NOT NULL,
	`fielding` integer NOT NULL,
	`keeping` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`deadline` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team` text NOT NULL,
	`player_id` text NOT NULL,
	`captain` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_team_member_tournament_player` ON `team_members` (`tournament_id`,`player_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`team_count` integer NOT NULL,
	`status` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
