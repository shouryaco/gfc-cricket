-- Apply once in the Supabase SQL Editor. The application uses a server-only database connection.

BEGIN;

CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"grade" text NOT NULL,
	"role" text NOT NULL,
	"batting" integer NOT NULL,
	"bowling" integer NOT NULL,
	"fielding" integer NOT NULL,
	"keeping" integer DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);

CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"deadline" text,
	"created_at" text NOT NULL
);

CREATE TABLE "tournaments" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"team_count" integer NOT NULL,
	"status" text NOT NULL,
	"balance" real DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"number" integer NOT NULL,
	"stage" text NOT NULL,
	"team_a" text,
	"team_b" text,
	"resting" text,
	"overs" integer DEFAULT 8 NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"toss_winner" text,
	"toss_choice" text,
	"batting_first" text,
	"winner" text,
	"result" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"striker_id" text,
	"nonstriker_id" text,
	"bowler_id" text,
	FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "availability" (
	"session_id" text NOT NULL,
	"player_id" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("player_id") REFERENCES "players"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"team" text NOT NULL,
	"player_id" text NOT NULL,
	"captain" integer DEFAULT 0 NOT NULL,
	FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("player_id") REFERENCES "players"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"innings" integer NOT NULL,
	"sequence" integer NOT NULL,
	"striker_id" text NOT NULL,
	"nonstriker_id" text NOT NULL,
	"bowler_id" text NOT NULL,
	"bat_runs" integer DEFAULT 0 NOT NULL,
	"extra_type" text DEFAULT 'none' NOT NULL,
	"extra_runs" integer DEFAULT 0 NOT NULL,
	"wicket" integer DEFAULT 0 NOT NULL,
	"dismissed_id" text,
	"wicket_type" text,
	"fielder_id" text,
	"legal" integer NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "awards" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"match_id" text,
	"kind" text NOT NULL,
	"player_id" text NOT NULL,
	"impact" real NOT NULL,
	"explanation" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("player_id") REFERENCES "players"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "rating_history" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"grade" text NOT NULL,
	"batting" integer NOT NULL,
	"bowling" integer NOT NULL,
	"fielding" integer NOT NULL,
	"keeping" integer NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("player_id") REFERENCES "players"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "club_users" (
	"email" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"player_id" text,
	"created_at" text NOT NULL,
	FOREIGN KEY ("player_id") REFERENCES "players"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "scorer_leases" (
	"match_id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"expires_at" text NOT NULL,
	"updated_at" text NOT NULL,
	FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "delivery_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"match_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"before_json" text NOT NULL,
	"after_json" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "substitute_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"fielding_team" text NOT NULL,
	"player_id" text NOT NULL,
	"from_team" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" text NOT NULL,
	FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("player_id") REFERENCES "players"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"detail" text NOT NULL,
	"created_at" text NOT NULL
);

CREATE UNIQUE INDEX "uq_availability_session_player" ON "availability" ("session_id","player_id");

CREATE UNIQUE INDEX "uq_delivery_match_sequence" ON "deliveries" ("match_id","sequence");

CREATE UNIQUE INDEX "uq_match_tournament_number" ON "matches" ("tournament_id","number");

CREATE UNIQUE INDEX "uq_team_member_tournament_player" ON "team_members" ("tournament_id","player_id");

ALTER TABLE "matches" ADD COLUMN "first_all_out" integer DEFAULT 0 NOT NULL;

ALTER TABLE "matches" ADD COLUMN "second_all_out" integer DEFAULT 0 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "public_enabled" integer DEFAULT 0 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "overs" integer DEFAULT 8 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "bowler_limit" integer DEFAULT 2 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "two_team_matches" integer DEFAULT 1 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "win_points" integer DEFAULT 2 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "tie_points" integer DEFAULT 1 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "no_result_points" integer DEFAULT 1 NOT NULL;

ALTER TABLE "tournaments" ADD COLUMN "automatic_toss_choice" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT);

ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "tournaments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "availability" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "awards" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "rating_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "club_users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "scorer_leases" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "delivery_corrections" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "substitute_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "audit" ENABLE ROW LEVEL SECURITY;

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

COMMIT;
