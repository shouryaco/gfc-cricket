import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(), name: text("name").notNull(), shortName: text("short_name").notNull(),
  grade: text("grade").notNull(), role: text("role").notNull(), batting: integer("batting").notNull(),
  bowling: integer("bowling").notNull(), fielding: integer("fielding").notNull(), keeping: integer("keeping").notNull().default(0),
  active: integer("active").notNull().default(1), createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), title: text("title").notNull(), date: text("date").notNull(),
  deadline: text("deadline"), createdAt: text("created_at").notNull(),
});
export const availability = sqliteTable("availability", {
  sessionId: text("session_id").notNull().references(() => sessions.id),
  playerId: text("player_id").notNull().references(() => players.id),
  status: text("status").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("uq_availability_session_player").on(t.sessionId,t.playerId)]);
export const tournaments = sqliteTable("tournaments", {
  id: text("id").primaryKey(), sessionId: text("session_id").notNull().references(() => sessions.id),
  teamCount: integer("team_count").notNull(), status: text("status").notNull(),
  balance: real("balance").notNull().default(0), version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(), publicEnabled: integer("public_enabled").notNull().default(0),
  overs: integer("overs").notNull().default(8), bowlerLimit: integer("bowler_limit").notNull().default(2),
  twoTeamMatches: integer("two_team_matches").notNull().default(1),
  winPoints: integer("win_points").notNull().default(2), tiePoints: integer("tie_points").notNull().default(1),
  noResultPoints: integer("no_result_points").notNull().default(1), automaticTossChoice: integer("automatic_toss_choice").notNull().default(0),
});
export const clubUsers = sqliteTable("club_users", {
  email: text("email").primaryKey(), role: text("role").notNull(),
  playerId: text("player_id").references(() => players.id), createdAt: text("created_at").notNull(),
});
export const scorerLeases = sqliteTable("scorer_leases", {
  matchId: text("match_id").primaryKey().references(() => matches.id),
  deviceId: text("device_id").notNull(), actorId: text("actor_id").notNull(),
  expiresAt: text("expires_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const deliveryCorrections = sqliteTable("delivery_corrections", {
  id: text("id").primaryKey(), deliveryId: text("delivery_id").notNull().references(() => deliveries.id),
  matchId: text("match_id").notNull().references(() => matches.id), actorId: text("actor_id").notNull(),
  before: text("before_json").notNull(), after: text("after_json").notNull(), reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});
export const substituteAssignments = sqliteTable("substitute_assignments", {
  id: text("id").primaryKey(), matchId: text("match_id").notNull().references(() => matches.id),
  fieldingTeam: text("fielding_team").notNull(), playerId: text("player_id").notNull().references(() => players.id),
  fromTeam: text("from_team").notNull(), active: integer("active").notNull().default(1),
  actorId: text("actor_id").notNull(), createdAt: text("created_at").notNull(),
});
export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  team: text("team").notNull(), playerId: text("player_id").notNull().references(() => players.id),
  captain: integer("captain").notNull().default(0),
}, (t) => [uniqueIndex("uq_team_member_tournament_player").on(t.tournamentId,t.playerId)]);
export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  number: integer("number").notNull(), stage: text("stage").notNull(), teamA: text("team_a"), teamB: text("team_b"),
  resting: text("resting"), overs: integer("overs").notNull().default(8), status: text("status").notNull().default("scheduled"),
  tossWinner: text("toss_winner"), tossChoice: text("toss_choice"), battingFirst: text("batting_first"),
  winner: text("winner"), result: text("result"), revision: integer("revision").notNull().default(0),
  firstAllOut: integer("first_all_out").notNull().default(0), secondAllOut: integer("second_all_out").notNull().default(0),
  strikerId: text("striker_id"), nonstrikerId: text("nonstriker_id"), bowlerId: text("bowler_id"),
}, (t) => [uniqueIndex("uq_match_tournament_number").on(t.tournamentId,t.number)]);
export const deliveries = sqliteTable("deliveries", {
  id: text("id").primaryKey(), matchId: text("match_id").notNull().references(() => matches.id),
  innings: integer("innings").notNull(), sequence: integer("sequence").notNull(),
  strikerId: text("striker_id").notNull(), nonstrikerId: text("nonstriker_id").notNull(), bowlerId: text("bowler_id").notNull(),
  batRuns: integer("bat_runs").notNull().default(0), extraType: text("extra_type").notNull().default("none"),
  extraRuns: integer("extra_runs").notNull().default(0), wicket: integer("wicket").notNull().default(0),
  dismissedId: text("dismissed_id"), wicketType: text("wicket_type"), fielderId: text("fielder_id"),
  legal: integer("legal").notNull(), active: integer("active").notNull().default(1),
  actorId: text("actor_id").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("uq_delivery_match_sequence").on(t.matchId,t.sequence)]);
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull(), action: text("action").notNull(),
  entityId: text("entity_id").notNull(), detail: text("detail").notNull(), createdAt: text("created_at").notNull(),
});
export const ratingHistory = sqliteTable("rating_history", {
  id: text("id").primaryKey(), playerId: text("player_id").notNull().references(() => players.id),
  grade: text("grade").notNull(), batting: integer("batting").notNull(), bowling: integer("bowling").notNull(),
  fielding: integer("fielding").notNull(), keeping: integer("keeping").notNull(),
  actorId: text("actor_id").notNull(), createdAt: text("created_at").notNull(),
});
export const awards = sqliteTable("awards", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  matchId: text("match_id").references(() => matches.id), kind: text("kind").notNull(),
  playerId: text("player_id").notNull().references(() => players.id), impact: real("impact").notNull(),
  explanation: text("explanation").notNull(), createdAt: text("created_at").notNull(),
});
