import { getDatabase } from "@/db/adapter";
import { getAdmin } from "@/app/admin-auth";
export const runtime="nodejs";
import { balance, generateTeams, inningsScore, nextCrease, playerImpact, standings, type Delivery, type Player, type Team } from "@/lib/cricket";

export const dynamic="force-dynamic";
const db=()=>getDatabase();
const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
const fail=(message:string,status=400)=>Response.json({error:message},{status});
async function rows<T>(sql:string,...args:unknown[]):Promise<T[]>{const r=await db().prepare(sql).bind(...args).all<T>();return r.results||[]}
async function one<T>(sql:string,...args:unknown[]):Promise<T|null>{return await db().prepare(sql).bind(...args).first<T>()}
async function run(sql:string,...args:unknown[]){return db().prepare(sql).bind(...args).run()}
const validScore=(n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<=100;
function requireValue(v:unknown,label:string){if(typeof v!=="string"||!v.trim())throw new Error(`${label} is required.`);return v.trim()}
async function log(actor:string,action:string,entity:string,detail:unknown){await run("INSERT INTO audit (id,actor_id,action,entity_id,detail,created_at) VALUES (?,?,?,?,?,?)",id(),actor,action,entity,JSON.stringify(detail),now())}
async function requireScorerLease(matchId:string,deviceId:unknown){if(typeof deviceId!=="string"||!deviceId)throw new Error("Claim this match on your scoring device first.");
  const lease=await one<{device_id:string;expires_at:string}>("SELECT device_id,expires_at FROM scorer_leases WHERE match_id=?",matchId);
  if(!lease||lease.device_id!==deviceId||lease.expires_at<now())throw new Error("Scoring is active on another device or your lease expired. Claim the match again.");
  await run("UPDATE scorer_leases SET expires_at=?,updated_at=? WHERE match_id=? AND device_id=?",new Date(Date.now()+90_000).toISOString(),now(),matchId,deviceId);
}
async function state(role:string,ownPlayerId:string|null){const [players,sessions,availability,tournaments,teamMembers,matches,deliveries,audit,ratingHistory,awards,clubUsers,scorerLeases,substitutes]=await Promise.all([
  rows<Player>("SELECT * FROM players ORDER BY name"),rows("SELECT * FROM sessions ORDER BY date DESC"),rows("SELECT * FROM availability"),
  rows("SELECT * FROM tournaments ORDER BY created_at DESC"),rows("SELECT * FROM team_members"),
  rows("SELECT * FROM matches ORDER BY number"),rows("SELECT * FROM deliveries ORDER BY sequence"),rows("SELECT * FROM audit ORDER BY created_at DESC LIMIT 30"),
  role==="admin"?rows("SELECT * FROM rating_history ORDER BY created_at DESC"):Promise.resolve([]),rows("SELECT * FROM awards ORDER BY created_at DESC"),
  role==="admin"?rows("SELECT * FROM club_users ORDER BY email"):Promise.resolve([]),
  role==="admin"||role==="scorer"?rows("SELECT * FROM scorer_leases"):Promise.resolve([]),rows("SELECT * FROM substitute_assignments WHERE active=1")]);
  return {role,ownPlayerId,players,sessions,availability,tournaments,teamMembers,matches,deliveries,audit:role==="admin"?audit:[],ratingHistory,awards,clubUsers,scorerLeases,substitutes};}

export async function GET(){try{const user=await getAdmin();if(!user)return fail("Sign in to view club records.",401);const role="admin";return Response.json(await state(role,null))}catch(e){return fail(e instanceof Error?e.message:"Unable to load club records.",500)}}

export async function POST(request:Request){try{
  const user=await getAdmin();if(!user)return fail("Sign in to make changes.",401);
  const p=await request.json() as Record<string,unknown>,action=String(p.action||"");
  const role="admin";
  const origin=request.headers.get("origin"),host=request.headers.get("host");if(origin&&new URL(origin).host!==host)return fail("Invalid request.",403);
  if(action!=="resetTournament"){
    if(typeof p.matchId==="string"&&await one("SELECT 1 FROM matches m JOIN tournaments t ON t.id=m.tournament_id WHERE m.id=? AND t.status='archived'",p.matchId))throw new Error("This tournament was reset. Select the new tournament.");
    if(typeof p.tournamentId==="string"&&await one("SELECT 1 FROM tournaments WHERE id=? AND status='archived'",p.tournamentId))throw new Error("This tournament was reset. Select the new tournament.");
  }
  let result:unknown={ok:true};
  if(action==="resetTournament"){
    const tid=requireValue(p.tournamentId,"Tournament"),t=await one<{id:string;status:string}>("SELECT id,status FROM tournaments WHERE id=?",tid);
    if(!t||t.status==="archived")throw new Error("Tournament is already reset.");
    await db().batch([db().prepare("UPDATE tournaments SET status='archived',public_enabled=0 WHERE id=? AND status!='archived'").bind(tid),db().prepare("DELETE FROM scorer_leases WHERE match_id IN (SELECT id FROM matches WHERE tournament_id=?)").bind(tid)]);
    await log(user.userId,"tournament_reset",tid,{previousStatus:t.status});result={id:tid};
  } else if(action==="claimScorer"){
    const mid=requireValue(p.matchId,"Match"),deviceId=requireValue(p.deviceId,"Device");
    if(deviceId.length>100||!await one("SELECT id FROM matches WHERE id=? AND status!='complete'",mid))throw new Error("Match is unavailable for scoring.");
    const existing=await one<{device_id:string;expires_at:string}>("SELECT device_id,expires_at FROM scorer_leases WHERE match_id=?",mid);
    if(existing&&existing.device_id!==deviceId&&existing.expires_at>now()&&!(role==="admin"&&p.takeover===true))throw new Error("This match is being scored on another device. An admin can take over.");
    await run("INSERT INTO scorer_leases (match_id,device_id,actor_id,expires_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(match_id) DO UPDATE SET device_id=excluded.device_id,actor_id=excluded.actor_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at",mid,deviceId,user.userId,new Date(Date.now()+90_000).toISOString(),now());
    await log(user.userId,existing&&existing.device_id!==deviceId?"scorer_takeover":"scorer_claimed",mid,{});result={deviceId};
  } else if(action==="heartbeat"){
    const mid=requireValue(p.matchId,"Match");await requireScorerLease(mid,p.deviceId);result={ok:true};
  } else if(action==="setPublic"){
    const tid=requireValue(p.tournamentId,"Tournament"),enabled=Number(Boolean(p.enabled));await run("UPDATE tournaments SET public_enabled=? WHERE id=?",enabled,tid);await log(user.userId,"public_score_changed",tid,{enabled});
  } else if(action==="addSubstitute"){
    const mid=requireValue(p.matchId,"Match"),pid=requireValue(p.playerId,"Substitute"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);
    if(!m||m.status==="complete"||!m.resting)throw new Error("A resting team is needed for a fielding substitute.");
    await requireScorerLease(mid,p.deviceId);
    const fieldingTeam=requireValue(p.fieldingTeam,"Fielding team");if(![m.team_a,m.team_b].includes(fieldingTeam))throw new Error("Choose a playing fielding team.");
    const member=await one<{team:string}>("SELECT team FROM team_members WHERE tournament_id=? AND player_id=?",m.tournament_id,pid);
    if(member?.team!==m.resting)throw new Error("Substitute must come from the resting team.");
    const available=await one("SELECT 1 FROM availability WHERE session_id=(SELECT session_id FROM tournaments WHERE id=?) AND player_id=? AND status='available'",m.tournament_id,pid);
    if(!available)throw new Error("Substitute is not currently available.");
    if(await one("SELECT 1 FROM substitute_assignments WHERE match_id=? AND player_id=? AND active=1",mid,pid))throw new Error("This substitute is already assigned.");
    await run("INSERT INTO substitute_assignments (id,match_id,fielding_team,player_id,from_team,active,actor_id,created_at) VALUES (?,?,?,?,?,1,?,?)",id(),mid,fieldingTeam,pid,m.resting,user.userId,now());await log(user.userId,"substitute_added",mid,{pid,fieldingTeam});
  } else if(action==="removeSubstitute"){
    const mid=requireValue(p.matchId,"Match"),pid=requireValue(p.playerId,"Substitute");await requireScorerLease(mid,p.deviceId);
    await run("UPDATE substitute_assignments SET active=0 WHERE match_id=? AND player_id=? AND active=1",mid,pid);await log(user.userId,"substitute_removed",mid,{pid});
  } else if(action==="player"){
    const name=requireValue(p.name,"Name");if(name.length>100)throw new Error("Name is too long.");
    const grade=String(p.grade||"C"),role=String(p.role||"Batter");if(!["A","B","C"].includes(grade)||!["Batter","Bowler","All-Rounder","Wicketkeeper"].includes(role))throw new Error("Invalid grade or role.");
    for(const k of ["batting","bowling","fielding","keeping"])if(!validScore(p[k]))throw new Error(`${k} must be 0–100.`);
    const short=String(p.shortName||name.split(" ")[0]).trim().slice(0,40),pid=typeof p.id==="string"?p.id:id();
    const before=p.id?await one<Player>("SELECT * FROM players WHERE id=?",pid):null;
    if(p.id&&!before)throw new Error("Player not found.");
    const commands=[];
    if(p.id)commands.push(db().prepare("UPDATE players SET name=?,short_name=?,grade=?,role=?,batting=?,bowling=?,fielding=?,keeping=? WHERE id=?").bind(name,short,grade,role,p.batting,p.bowling,p.fielding,p.keeping,pid));
    else commands.push(db().prepare("INSERT INTO players (id,name,short_name,grade,role,batting,bowling,fielding,keeping,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)").bind(pid,name,short,grade,role,p.batting,p.bowling,p.fielding,p.keeping,now()));
    commands.push(db().prepare("INSERT INTO rating_history (id,player_id,grade,batting,bowling,fielding,keeping,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id(),pid,grade,p.batting,p.bowling,p.fielding,p.keeping,user.userId,now()));
    await db().batch(commands);
    await log(user.userId,p.id?"player_updated":"player_created",pid,{name,grade,role});result={id:pid};
  } else if(action==="session"){
    const title=requireValue(p.title,"Session title"),date=requireValue(p.date,"Date");if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Use a valid YYYY-MM-DD date.");
    const sid=id();await run("INSERT INTO sessions (id,title,date,deadline,created_at) VALUES (?,?,?,?,?)",sid,title,date,p.deadline||null,now());await log(user.userId,"session_created",sid,{title,date});result={id:sid};
  } else if(action==="availability"){
    const sid=requireValue(p.sessionId,"Session"),pid=requireValue(p.playerId,"Player"),status=String(p.status);
    if(!["available","maybe","unavailable","withdrawn"].includes(status))throw new Error("Invalid availability.");
    await run("INSERT INTO availability (session_id,player_id,status,updated_at) VALUES (?,?,?,?) ON CONFLICT(session_id,player_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at",sid,pid,status,now());await log(user.userId,"availability_changed",sid,{pid,status});
  } else if(action==="availabilityBulk"){
    const sid=requireValue(p.sessionId,"Session"),status=String(p.status);
    if(!["available","maybe","unavailable","withdrawn"].includes(status))throw new Error("Invalid availability.");
    if(!await one("SELECT id FROM sessions WHERE id=?",sid))throw new Error("Playing day not found.");
    const active=await rows<{id:string}>("SELECT id FROM players WHERE active=1");
    const selected=p.playerIds;
    if(!Array.isArray(selected)||!selected.length||selected.length>active.length||!selected.every(x=>typeof x==="string")||new Set(selected).size!==selected.length||selected.some(x=>!active.some(a=>a.id===x)))throw new Error("Choose active players for this playing day.");
    const timestamp=now();
    await db().batch(selected.map(pid=>db().prepare("INSERT INTO availability (session_id,player_id,status,updated_at) VALUES (?,?,?,?) ON CONFLICT(session_id,player_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at").bind(sid,pid,status,timestamp)));
    await log(user.userId,"availability_bulk_changed",sid,{count:selected.length,status});result={count:selected.length};
  } else if(action==="generate"){
    const sid=requireValue(p.sessionId,"Session"),count=Number(p.teamCount),captains=p.captains;
    if(![2,3].includes(count)||!Array.isArray(captains)||!captains.every(x=>typeof x==="string"))throw new Error("Choose 2 or 3 captains.");
    const matchOvers=Number(p.overs??8),bowlerLimit=Number(p.bowlerLimit??2),twoTeamMatches=count===2?Number(p.twoTeamMatches??1):1;
    if(!Number.isInteger(matchOvers)||matchOvers<1||matchOvers>50||!Number.isInteger(bowlerLimit)||bowlerLimit<1||bowlerLimit>matchOvers||![1,3,5].includes(twoTeamMatches))throw new Error("Check the over and match format settings.");
    const existing=await one<{id:string}>("SELECT id FROM tournaments WHERE session_id=? AND status!='archived'",sid);if(existing)throw new Error("This session already has teams. Use its existing tournament.");
    const pool=await rows<Player>("SELECT p.* FROM players p JOIN availability a ON a.player_id=p.id WHERE a.session_id=? AND a.status='available' AND p.active=1",sid);
    const proposal=generateTeams(pool,captains as string[],count),tid=id();
    const statements=[db().prepare("INSERT INTO tournaments (id,session_id,team_count,status,balance,version,created_at,overs,bowler_limit,two_team_matches,automatic_toss_choice) VALUES (?,?,?,'generated',?,1,?,?,?,?,?)").bind(tid,sid,count,proposal.score,now(),matchOvers,bowlerLimit,twoTeamMatches,Number(Boolean(p.automaticTossChoice)))];
    for(const t of proposal.teams)for(const pid of t.playerIds)statements.push(db().prepare("INSERT INTO team_members (id,tournament_id,team,player_id,captain) VALUES (?,?,?,?,?)").bind(id(),tid,t.name,pid,Number(pid===t.captainId)));
    await db().batch(statements);await log(user.userId,"teams_generated",tid,{captains,score:proposal.score});result={id:tid,...proposal};
  } else if(action==="swap"){
    const tid=requireValue(p.tournamentId,"Tournament"),a=requireValue(p.playerA,"First player"),b=requireValue(p.playerB,"Second player");
    const members=await rows<{player_id:string;team:string;captain:number}>("SELECT player_id,team,captain FROM team_members WHERE tournament_id=?",tid),ma=members.find(m=>m.player_id===a),mb=members.find(m=>m.player_id===b);
    if(!ma||!mb||ma.team===mb.team||ma.captain||mb.captain)throw new Error("Choose two non-captains on different teams.");
    const t=await one<{status:string;session_id:string;version:number}>("SELECT * FROM tournaments WHERE id=?",tid);if(!t||!["generated","locked"].includes(t.status))throw new Error("Teams cannot be changed after play starts.");
    const roster=await rows<Player>("SELECT p.* FROM players p JOIN team_members tm ON tm.player_id=p.id WHERE tm.tournament_id=?",tid);
    const teamNames=[...new Set(members.map(m=>m.team))],teams:Team[]=teamNames.map(name=>({name,captainId:members.find(m=>m.team===name&&m.captain)?.player_id||"",playerIds:members.filter(m=>m.team===name).map(m=>m.player_id)}));
    teams.find(x=>x.name===ma.team)!.playerIds.splice(teams.find(x=>x.name===ma.team)!.playerIds.indexOf(a),1,b);teams.find(x=>x.name===mb.team)!.playerIds.splice(teams.find(x=>x.name===mb.team)!.playerIds.indexOf(b),1,a);
    const score=balance(teams,roster).score;
    if(p.preview){result={score,teams}}else{await db().batch([db().prepare("UPDATE team_members SET team=? WHERE tournament_id=? AND player_id=?").bind(mb.team,tid,a),db().prepare("UPDATE team_members SET team=? WHERE tournament_id=? AND player_id=?").bind(ma.team,tid,b),db().prepare("UPDATE tournaments SET balance=?,version=version+1 WHERE id=?").bind(score,tid)]);await log(user.userId,"players_swapped",tid,{a,b,score});result={score}}
  } else if(action==="addLate"){
    const tid=requireValue(p.tournamentId,"Tournament"),t=await one<{session_id:string;status:string;team_count:number}>("SELECT * FROM tournaments WHERE id=?",tid);
    if(!t||!["generated","locked","final_ready"].includes(t.status))throw new Error("This tournament is complete. Create a new playing day to add players.");
    const pool=await rows<Player>("SELECT p.* FROM players p JOIN availability a ON a.player_id=p.id WHERE a.session_id=? AND a.status='available' AND p.active=1",t.session_id);
    const members=await rows<{player_id:string;team:string;captain:number}>("SELECT player_id,team,captain FROM team_members WHERE tournament_id=?",tid);
    const pending=pool.filter(x=>!members.some(m=>m.player_id===x.id));if(!pending.length)throw new Error("No new available players to place.");
    const names=["Team A","Team B","Team C"].slice(0,t.team_count),base:Team[]=names.map(name=>({name,captainId:members.find(m=>m.team===name&&m.captain)?.player_id||"",playerIds:members.filter(m=>m.team===name).map(m=>m.player_id)}));
    const roster=await rows<Player>("SELECT p.* FROM players p JOIN team_members tm ON tm.player_id=p.id WHERE tm.tournament_id=?",tid);
    const players=[...roster,...pending];
    const gap=(teams:Team[])=>Math.max(...teams.map(x=>x.playerIds.length))-Math.min(...teams.map(x=>x.playerIds.length));
    const withPlayer=(teams:Team[],index:number,playerId:string)=>teams.map((team,i)=>({...team,playerIds:i===index?[...team.playerIds,playerId]:[...team.playerIds]}));
    const candidates:Team[][]=[];
    if(pending.length<=8){function visit(i:number,teams:Team[]){if(i===pending.length){candidates.push(teams);return}for(let k=0;k<teams.length;k++)visit(i+1,withPlayer(teams,k,pending[i].id))}visit(0,base)}
    else{let teams=base;for(const player of pending){teams=teams.map((_,index)=>withPlayer(teams,index,player.id)).sort((a,b)=>gap(a)-gap(b)||balance(b,players).score-balance(a,players).score)[0]}candidates.push(teams)}
    const best=candidates.sort((a,b)=>gap(a)-gap(b)||balance(b,players).score-balance(a,players).score)[0];if(!best)throw new Error("No placement is possible for the current teams.");
    const score=balance(best,players).score,placements=pending.map(x=>({playerId:x.id,team:best.find(team=>team.playerIds.includes(x.id))!.name}));
    if(p.preview)result={score,placements};else{const commands=placements.map(x=>db().prepare("INSERT INTO team_members (id,tournament_id,team,player_id,captain) VALUES (?,?,?,?,0)").bind(id(),tid,x.team,x.playerId));commands.push(db().prepare("UPDATE tournaments SET balance=?,version=version+1 WHERE id=?").bind(score,tid));await db().batch(commands);await log(user.userId,"late_players_added",tid,{placements,score});result={score,placements}}
  } else if(action==="rebalance"){
    const tid=requireValue(p.tournamentId,"Tournament"),t=await one<{session_id:string;status:string;team_count:number}>("SELECT * FROM tournaments WHERE id=?",tid);
    if(!t||!["generated","locked"].includes(t.status))throw new Error("This tournament cannot be rebalanced now.");
    if(await one("SELECT id FROM matches WHERE tournament_id=? AND status!='scheduled'",tid))throw new Error("A match has already started. Preserve that match history.");
    const old=await rows<{team:string;player_id:string;captain:number}>("SELECT * FROM team_members WHERE tournament_id=?",tid),pool=await rows<Player>("SELECT p.* FROM players p JOIN availability a ON a.player_id=p.id WHERE a.session_id=? AND a.status='available' AND p.active=1",t.session_id);
    const captains=["Team A","Team B","Team C"].slice(0,t.team_count).map(name=>old.find(x=>x.team===name&&x.captain)?.player_id||"");
    const proposal=generateTeams(pool,captains,t.team_count);
    if(p.preview)result=proposal;else{const commands=[db().prepare("DELETE FROM team_members WHERE tournament_id=?").bind(tid)];for(const team of proposal.teams)for(const pid of team.playerIds)commands.push(db().prepare("INSERT INTO team_members (id,tournament_id,team,player_id,captain) VALUES (?,?,?,?,?)").bind(id(),tid,team.name,pid,Number(pid===team.captainId)));
      commands.push(db().prepare("UPDATE tournaments SET balance=?,version=version+1 WHERE id=?").bind(proposal.score,tid));await db().batch(commands);await log(user.userId,"teams_rebalanced",tid,{score:proposal.score});result=proposal}
  } else if(action==="confirm"){
    const tid=requireValue(p.tournamentId,"Tournament"),t=await one<{status:string;team_count:number;overs:number;two_team_matches:number}>("SELECT * FROM tournaments WHERE id=?",tid);if(!t||t.status!=="generated")throw new Error("Only generated teams can be confirmed.");
    const names=["Team A","Team B","Team C"],fixtures=t.team_count===3?[[0,1,2],[1,2,0],[0,2,1]]:Array.from({length:t.two_team_matches},(_,i)=>i%2?[1,0,-1]:[0,1,-1]);
    const commands=[db().prepare("UPDATE tournaments SET status='locked' WHERE id=?").bind(tid)];
    fixtures.forEach(([a,b,r],i)=>commands.push(db().prepare("INSERT INTO matches (id,tournament_id,number,stage,team_a,team_b,resting,overs,status,revision) VALUES (?,?,?,'league',?,?,?,?,'scheduled',0)").bind(id(),tid,i+1,names[a],names[b],r<0?null:names[r],t.overs)));
    await db().batch(commands);await log(user.userId,"teams_confirmed",tid,{});
  } else if(action==="toss"){
    const mid=requireValue(p.matchId,"Match"),m=await one<{team_a:string;team_b:string;toss_winner:string|null;status:string}>("SELECT * FROM matches WHERE id=?",mid);if(!m||m.status!=="scheduled")throw new Error("Match is not ready for a toss.");
    if(m.toss_winner)result={winner:m.toss_winner};else{const coin=new Uint32Array(2);crypto.getRandomValues(coin);const winner=coin[0]%2?m.team_a:m.team_b;
      const t=await one<{automatic_toss_choice:number}>("SELECT automatic_toss_choice FROM tournaments WHERE id=(SELECT tournament_id FROM matches WHERE id=?)",mid);
      const choice=t?.automatic_toss_choice?(coin[1]%2?"bat":"bowl"):null,first=choice?choice==="bat"?winner:winner===m.team_a?m.team_b:m.team_a:null;
      await run("UPDATE matches SET toss_winner=?,toss_choice=?,batting_first=? WHERE id=? AND toss_winner IS NULL",winner,choice,first,mid);await log(user.userId,"digital_toss",mid,{winner,choice});result={winner,choice}}
  } else if(action==="tossChoice"){
    const mid=requireValue(p.matchId,"Match"),choice=String(p.choice);if(!["bat","bowl"].includes(choice))throw new Error("Choose bat or bowl.");
    const m=await one<{team_a:string;team_b:string;toss_winner:string|null;toss_choice:string|null}>("SELECT * FROM matches WHERE id=?",mid);if(!m?.toss_winner||m.toss_choice)throw new Error("Toss decision is already set or the toss has not occurred.");
    const first=choice==="bat"?m.toss_winner:m.toss_winner===m.team_a?m.team_b:m.team_a;
    await run("UPDATE matches SET toss_choice=?,batting_first=? WHERE id=? AND toss_choice IS NULL",choice,first,mid);await log(user.userId,"toss_decision",mid,{choice,first});
  } else if(action==="start"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<{id:string;status:string;batting_first:string|null;team_a:string;team_b:string}>("SELECT * FROM matches WHERE id=?",mid);
    if(!m||m.status!=="scheduled"||!m.batting_first)throw new Error("Complete the toss first.");
    const striker=requireValue(p.strikerId,"Striker"),non=requireValue(p.nonstrikerId,"Non-striker"),bowler=requireValue(p.bowlerId,"Bowler");
    if(striker===non)throw new Error("Choose different opening batters.");await validateRoles(m,1,striker,non,bowler);
    await run("UPDATE matches SET status='innings1',striker_id=?,nonstriker_id=?,bowler_id=? WHERE id=? AND status='scheduled'",striker,non,bowler,mid);await log(user.userId,"match_started",mid,{});
  } else if(action==="setBatters"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);if(!m||!["innings1","innings2"].includes(m.status))throw new Error("Match is not live.");
    const striker=requireValue(p.strikerId,"Striker"),non=requireValue(p.nonstrikerId,"Non-striker"),bowler=requireValue(p.bowlerId,"Bowler");
    if(striker===non)throw new Error("Batters must be different.");await validateRoles(m,m.status==="innings1"?1:2,striker,non,bowler);
    const used=await rows<{dismissed_id:string}>("SELECT dismissed_id FROM deliveries WHERE match_id=? AND innings=? AND active=1 AND wicket=1",mid,m.status==="innings1"?1:2);
    if(used.some(x=>x.dismissed_id===striker||x.dismissed_id===non))throw new Error("A dismissed batter cannot return.");
    const revision=Number(p.revision);if(revision!==m.revision)throw new Error("The score changed on another device. Reload the crease.");
    await run("UPDATE matches SET striker_id=?,nonstriker_id=?,bowler_id=?,revision=revision+1 WHERE id=? AND revision=?",striker,non,bowler,mid,revision);
  } else if(action==="switchStrike"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<{status:string;revision:number;striker_id:string|null;nonstriker_id:string|null}>("SELECT status,revision,striker_id,nonstriker_id FROM matches WHERE id=?",mid);
    if(!m||!["innings1","innings2"].includes(m.status)||!m.striker_id||!m.nonstriker_id)throw new Error("Choose two batters before switching strike.");
    const revision=Number(p.revision);if(revision!==m.revision)throw new Error("The score changed on another device. Reload before switching strike.");
    await run("UPDATE matches SET striker_id=?,nonstriker_id=?,revision=revision+1 WHERE id=? AND revision=?",m.nonstriker_id,m.striker_id,mid,revision);
    await log(user.userId,"strike_switched",mid,{from:m.striker_id,to:m.nonstriker_id});
  } else if(action==="ball"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);if(!m||!["innings1","innings2"].includes(m.status))throw new Error("Match is not live.");
    const innings=m.status==="innings1"?1:2,all=await rows<Delivery>("SELECT * FROM deliveries WHERE match_id=? AND active=1 ORDER BY sequence",mid),s=inningsScore(all,innings);
    const tournamentRules=await one<{bowler_limit:number}>("SELECT bowler_limit FROM tournaments WHERE id=?",m.tournament_id);
    const bowlerBalls=all.filter(d=>d.active&&d.innings===innings&&d.bowler_id===m.bowler_id).reduce((n,d)=>n+d.legal,0);
    if(bowlerBalls>=6*(tournamentRules?.bowler_limit||2))throw new Error("This bowler has reached the tournament over limit.");
    const battingTeam=innings===1?m.batting_first:m.batting_first===m.team_a?m.team_b:m.team_a;
    const rosterCount=(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,battingTeam)).length;
    const wicketLimit=Math.max(1,rosterCount-1),targetBefore=innings===2?inningsScore(all,1).runs+1:null;
    if(s.balls>=m.overs*6||s.wickets>=wicketLimit||targetBefore!==null&&s.runs>=targetBefore)throw new Error("The innings is complete. Continue to the next stage.");
    const expected=Number(p.revision);if(!Number.isInteger(expected)||expected!==m.revision)throw new Error("The score changed on another device. Reload before scoring.");
    const bat=Number(p.batRuns),extra=Number(p.extraRuns||0),type=String(p.extraType||"none"),wicket=Number(Boolean(p.wicket));
    if(!Number.isInteger(bat)||bat<0||bat>6||!Number.isInteger(extra)||extra<0||extra>7||!["none","wide","no_ball","bye","leg_bye"].includes(type))throw new Error("Invalid delivery.");
    if((type==="wide"||type==="no_ball")&&extra<1)throw new Error("A wide or no-ball needs at least one extra run.");
    if((type==="bye"||type==="leg_bye")&&bat)throw new Error("Byes cannot also be bat runs.");
    if(wicket&&!p.dismissedId)throw new Error("Select the dismissed player.");
    const dismissed=wicket?requireValue(p.dismissedId,"Dismissed player"):null;if(dismissed&&![m.striker_id,m.nonstriker_id].includes(dismissed))throw new Error("Dismissed player must be at the crease.");
    const scoreBatter=m.striker_id;if(!scoreBatter||!m.nonstriker_id||!m.bowler_id)throw new Error("Select two batters and a bowler first.");
    await validateRoles(m,innings,m.striker_id,m.nonstriker_id,m.bowler_id);
    if(wicket)await validateFielder(m,innings,String(p.wicketType||""),p.fielderId);
    const legal=!(["wide","no_ball"].includes(type)),lastSequence=await one<{n:number}>("SELECT COALESCE(MAX(sequence),0) AS n FROM deliveries WHERE match_id=?",mid),seq=(lastSequence?.n||0)+1,did=id();
    const next=nextCrease({strikerId:m.striker_id,nonStrikerId:m.nonstriker_id,batRuns:bat,extraRuns:extra,extraType:type,legalBallsBefore:s.balls,dismissedId:dismissed});
    const striker=next.strikerId,non=next.nonStrikerId;
    const target=targetBefore,allOut=s.wickets+wicket>=wicketLimit,done=legal&&s.balls+1>=m.overs*6||allOut||target!==null&&s.runs+bat+extra>=target;
    const statements=[db().prepare("INSERT INTO deliveries (id,match_id,innings,sequence,striker_id,nonstriker_id,bowler_id,bat_runs,extra_type,extra_runs,wicket,dismissed_id,wicket_type,fielder_id,legal,active,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)").bind(did,mid,innings,seq,scoreBatter,m.nonstriker_id,m.bowler_id,bat,type,extra,wicket,dismissed,p.wicketType||null,p.fielderId||null,Number(legal),user.userId,now()),
      db().prepare("UPDATE matches SET revision=revision+1,striker_id=?,nonstriker_id=?,bowler_id=? WHERE id=? AND revision=?").bind(striker,non,next.overComplete?null:m.bowler_id,mid,expected)];
    await db().batch(statements);await log(user.userId,"delivery_recorded",mid,{did,innings,bat,extra,type,wicket});result={done,score:s.runs+bat+extra,balls:s.balls+Number(legal)};
  } else if(action==="undo"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);if(!m||!["innings1","innings2"].includes(m.status)||Number(p.revision)!==m.revision)throw new Error("Reload the live score before undoing.");
    const last=await one<Delivery>("SELECT * FROM deliveries WHERE match_id=? AND active=1 ORDER BY sequence DESC LIMIT 1",mid);if(!last||last.innings!==(m.status==="innings1"?1:2))throw new Error("There is no ball to undo in this innings.");
    await db().batch([db().prepare("UPDATE deliveries SET active=0 WHERE id=?").bind(last.id),db().prepare("UPDATE matches SET revision=revision+1,striker_id=?,nonstriker_id=?,bowler_id=? WHERE id=?").bind(last.striker_id,last.nonstriker_id,last.bowler_id,mid)]);await log(user.userId,"delivery_undone",mid,{deliveryId:last.id});
  } else if(action==="editBall"){
    const mid=requireValue(p.matchId,"Match"),deliveryId=requireValue(p.deliveryId,"Delivery"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);
    if(!m||Number(p.revision)!==m.revision)throw new Error("The match changed. Reload before correcting the ball.");
    if(m.status==="complete"&&role!=="admin")throw new Error("Only an admin can correct a completed match.");
    if(m.status!=="complete")await requireScorerLease(mid,p.deviceId);
    const all=await rows<Delivery>("SELECT * FROM deliveries WHERE match_id=? AND active=1 ORDER BY sequence",mid),old=all.find(d=>d.id===deliveryId);
    if(!old)throw new Error("Delivery not found.");
    const bat=Number(p.batRuns),extra=Number(p.extraRuns??0),type=String(p.extraType||"none"),wicket=Number(Boolean(p.wicket));
    if(!Number.isInteger(bat)||bat<0||bat>6||!Number.isInteger(extra)||extra<0||extra>7||!["none","wide","no_ball","bye","leg_bye"].includes(type))throw new Error("Invalid corrected delivery.");
    if(["wide","no_ball"].includes(type)&&extra<1||["bye","leg_bye"].includes(type)&&bat)throw new Error("Check the extra and bat runs.");
    const legal=Number(!["wide","no_ball"].includes(type)),dismissed=wicket?requireValue(p.dismissedId,"Dismissed batter"):null;
    if(dismissed&&![old.striker_id,old.nonstriker_id].includes(dismissed))throw new Error("Dismissed player must be at the crease.");
    if(wicket)await validateFielder(m,old.innings,String(p.wicketType||""),p.fielderId);
    const later=all.filter(d=>d.innings===old.innings&&d.sequence>old.sequence);
    const physicalRuns=(b:number,e:number,t:string)=>b+(["bye","leg_bye"].includes(t)?e:(["wide","no_ball"].includes(t)?Math.max(0,e-1):0));
    if(later.length&&(legal!==old.legal||wicket!==old.wicket||dismissed!==old.dismissed_id||physicalRuns(bat,extra,type)%2!==physicalRuns(old.bat_runs,old.extra_runs,old.extra_type)%2))
      throw new Error("This change affects later batters or over order. Undo back to this ball and re-score from there.");
    const updated={...old,bat_runs:bat,extra_runs:extra,extra_type:type,legal,wicket,dismissed_id:dismissed,wicket_type:wicket?String(p.wicketType||"other"):null,fielder_id:wicket&&typeof p.fielderId==="string"?p.fielderId:null};
    const revised=all.map(d=>d.id===deliveryId?updated:d),first=inningsScore(revised,1),second=inningsScore(revised,2);
    const firstTeam=m.batting_first,secondTeam=firstTeam===m.team_a?m.team_b:m.team_a;
    const winner=m.status==="complete"?(first.runs===second.runs?null:first.runs>second.runs?firstTeam:secondTeam):m.winner;
    const resultText=m.status==="complete"?(!winner?"Tie":winner===firstTeam?`${firstTeam} won by ${first.runs-second.runs} runs`:`${secondTeam} won by ${Math.max(0,(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,secondTeam)).length-1-second.wickets)} wickets`):m.result;
    const summary={before:{first:inningsScore(all,1).runs,second:inningsScore(all,2).runs},after:{first:first.runs,second:second.runs},result:resultText};
    let finalChange:{id:string;teamA:string;teamB:string;resting:string|null}|null=null;
    if(m.status==="complete"&&m.stage==="league"){
      const league=await rows<any>("SELECT * FROM matches WHERE tournament_id=? AND stage='league'",m.tournament_id);
      const final=await one<any>("SELECT * FROM matches WHERE tournament_id=? AND stage='final'",m.tournament_id);
      if(final&&league.length===3){
        const allTournament=await rows<any>("SELECT d.*,m.id AS match_id FROM deliveries d JOIN matches m ON m.id=d.match_id WHERE m.tournament_id=? AND d.active=1",m.tournament_id);
        const hypothetical=allTournament.map(d=>d.id===deliveryId?{...updated,match_id:mid}:d);
        const countFirst=(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,firstTeam)).length,countSecond=(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,secondTeam)).length;
        const revisedMatches=league.map(x=>x.id===mid?{...x,winner,result:resultText,first_all_out:Number(first.wickets>=Math.max(1,countFirst-1)),second_all_out:Number(second.wickets>=Math.max(1,countSecond-1))}:x);
        const rank=standings(revisedMatches,hypothetical,await one<any>("SELECT win_points AS winPoints,tie_points AS tiePoints,no_result_points AS noResultPoints FROM tournaments WHERE id=?",m.tournament_id)||{});
        if(rank[0]&&rank[1]&&(rank[0].team!==final.team_a||rank[1].team!==final.team_b)){
          if(final.status!=="scheduled")throw new Error("This correction changes final qualification after the final started. Archive and review the tournament before altering this result.");
          finalChange={id:final.id,teamA:rank[0].team,teamB:rank[1].team,resting:rank[2]?.team||null};
        }
      }
    }
    if(p.preview){result=summary}else{
      const reason=requireValue(p.reason,"Correction reason"),commands=[
        db().prepare("UPDATE deliveries SET bat_runs=?,extra_type=?,extra_runs=?,wicket=?,dismissed_id=?,wicket_type=?,fielder_id=?,legal=? WHERE id=? AND active=1").bind(bat,type,extra,wicket,dismissed,updated.wicket_type,updated.fielder_id,legal,deliveryId),
        db().prepare("INSERT INTO delivery_corrections (id,delivery_id,match_id,actor_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id(),deliveryId,mid,user.userId,JSON.stringify(old),JSON.stringify(updated),reason,now())];
      if(m.status==="complete"){
        const countFirst=(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,firstTeam)).length,countSecond=(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,secondTeam)).length;
        commands.push(db().prepare("UPDATE matches SET revision=revision+1,winner=?,result=?,first_all_out=?,second_all_out=? WHERE id=? AND revision=?").bind(winner,resultText,Number(first.wickets>=Math.max(1,countFirst-1)),Number(second.wickets>=Math.max(1,countSecond-1)),mid,m.revision));
        const roster=await rows<{player_id:string}>("SELECT player_id FROM team_members WHERE tournament_id=? AND team IN (?,?)",m.tournament_id,m.team_a,m.team_b);
        const best=roster.map(x=>({id:x.player_id,...playerImpact(revised,x.player_id)})).sort((a,b)=>b.impact-a.impact||a.id.localeCompare(b.id))[0];
        if(best)commands.push(db().prepare("UPDATE awards SET player_id=?,impact=?,explanation=? WHERE match_id=? AND kind='POTM'").bind(best.id,best.impact,JSON.stringify(best),mid));
        if(finalChange)commands.push(db().prepare("UPDATE matches SET team_a=?,team_b=?,resting=? WHERE id=? AND status='scheduled'").bind(finalChange.teamA,finalChange.teamB,finalChange.resting,finalChange.id));
        const finished=await one<{status:string}>("SELECT status FROM tournaments WHERE id=?",m.tournament_id);
        if(finished?.status==="complete"){
          const tournamentBalls=await rows<Delivery&{match_id:string}>("SELECT d.* FROM deliveries d JOIN matches m ON m.id=d.match_id WHERE m.tournament_id=? AND d.active=1",m.tournament_id);
          const revisedTournament=tournamentBalls.map(d=>d.id===deliveryId?{...updated,match_id:mid}:d);
          const allPlayers=await rows<{player_id:string}>("SELECT DISTINCT player_id FROM team_members WHERE tournament_id=?",m.tournament_id);
          const top=allPlayers.map(x=>({id:x.player_id,...playerImpact(revisedTournament,x.player_id)})).sort((a,b)=>b.impact-a.impact||a.id.localeCompare(b.id))[0];
          if(top)commands.push(db().prepare("UPDATE awards SET player_id=?,impact=?,explanation=? WHERE tournament_id=? AND kind='POTT'").bind(top.id,top.impact,JSON.stringify(top),m.tournament_id));
        }
      }else{
        let striker=m.striker_id,non=m.nonstriker_id,bowler=m.bowler_id;
        if(!later.length&&m.status===`innings${old.innings}`){const next=nextCrease({strikerId:old.striker_id,nonStrikerId:old.nonstriker_id,batRuns:bat,extraRuns:extra,extraType:type,legalBallsBefore:inningsScore(revised,old.innings).balls-legal,dismissedId:dismissed});striker=next.strikerId;non=next.nonStrikerId;if(next.overComplete)bowler=null}
        commands.push(db().prepare("UPDATE matches SET revision=revision+1,striker_id=?,nonstriker_id=?,bowler_id=? WHERE id=? AND revision=?").bind(striker,non,bowler,mid,m.revision));
      }
      await db().batch(commands);await log(user.userId,"delivery_corrected",mid,{deliveryId,reason,before:summary.before,after:summary.after});result=summary;
    }
  } else if(action==="endInnings"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);if(!m||m.status!=="innings1")throw new Error("First innings is not active.");
    const ds=await rows<Delivery>("SELECT * FROM deliveries WHERE match_id=? AND active=1",mid),score=inningsScore(ds,1),roster=(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,m.batting_first)).length;
    await run("UPDATE matches SET status='break',first_all_out=?,striker_id=NULL,nonstriker_id=NULL,bowler_id=NULL WHERE id=?",Number(score.wickets>=Math.max(1,roster-1)),mid);await log(user.userId,"innings_ended",mid,{});
  } else if(action==="startChase"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);if(!m||m.status!=="break")throw new Error("Finish the first innings first.");
    const striker=requireValue(p.strikerId,"Striker"),non=requireValue(p.nonstrikerId,"Non-striker"),bowler=requireValue(p.bowlerId,"Bowler");if(striker===non)throw new Error("Choose different batters.");await validateRoles(m,2,striker,non,bowler);
    await run("UPDATE matches SET status='innings2',striker_id=?,nonstriker_id=?,bowler_id=? WHERE id=?",striker,non,bowler,mid);
  } else if(action==="finish"){
    await requireScorerLease(requireValue(p.matchId,"Match"),p.deviceId);
    const mid=requireValue(p.matchId,"Match"),m=await one<any>("SELECT * FROM matches WHERE id=?",mid);if(!m||m.status!=="innings2")throw new Error("Complete both innings first.");
    const ds=await rows<Delivery>("SELECT * FROM deliveries WHERE match_id=? AND active=1",mid),oneScore=inningsScore(ds,1),twoScore=inningsScore(ds,2);
    const first=m.batting_first,second=first===m.team_a?m.team_b:m.team_a;
    const secondRoster=(await rows("SELECT id FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,second)).length,secondAllOut=twoScore.wickets>=Math.max(1,secondRoster-1);
    if(twoScore.runs<=oneScore.runs&&twoScore.balls<m.overs*6&&!secondAllOut)throw new Error("The chase is still live. Complete the overs or record the remaining wickets first.");
    const winner=oneScore.runs===twoScore.runs?null:oneScore.runs>twoScore.runs?first:second;
    const resultText=!winner?"Tie":winner===first?`${first} won by ${oneScore.runs-twoScore.runs} runs`:`${second} won by ${Math.max(0,(await rows("SELECT * FROM team_members WHERE tournament_id=? AND team=?",m.tournament_id,second)).length-1-twoScore.wickets)} wickets`;
    const candidates=await rows<{player_id:string}>("SELECT player_id FROM team_members WHERE tournament_id=? AND team IN (?,?)",m.tournament_id,m.team_a,m.team_b);
    const impacts=candidates.map(c=>({playerId:c.player_id,...playerImpact(ds,c.player_id)})).sort((a,b)=>b.impact-a.impact||a.playerId.localeCompare(b.playerId));
    const commands=[db().prepare("UPDATE matches SET status='complete',winner=?,result=?,second_all_out=?,striker_id=NULL,nonstriker_id=NULL,bowler_id=NULL WHERE id=?").bind(winner,resultText,Number(secondAllOut),mid)];
    if(impacts[0])commands.push(db().prepare("INSERT INTO awards (id,tournament_id,match_id,kind,player_id,impact,explanation,created_at) VALUES (?,?,?,'POTM',?,?,?,?)").bind(id(),m.tournament_id,mid,impacts[0].playerId,impacts[0].impact,JSON.stringify(impacts[0]),now()));
    await db().batch(commands);await log(user.userId,"match_completed",mid,{result:resultText});
    const league=await rows<any>("SELECT * FROM matches WHERE tournament_id=? AND stage='league'",m.tournament_id);
    if(m.stage==="league"&&league.length===3&&league.every(x=>x.id===mid||x.status==="complete")){
      const complete=league.map(x=>x.id===mid?{...x,status:"complete",winner,result:resultText,second_all_out:Number(secondAllOut)}:x),all=await rows<any>("SELECT d.*,m.id AS match_id FROM deliveries d JOIN matches m ON m.id=d.match_id WHERE m.tournament_id=?",m.tournament_id);
      const rank=standings(complete,all,await one<any>("SELECT win_points AS winPoints,tie_points AS tiePoints,no_result_points AS noResultPoints FROM tournaments WHERE id=?",m.tournament_id)||{});if(rank.length>=2){await run("INSERT INTO matches (id,tournament_id,number,stage,team_a,team_b,resting,overs,status,revision) VALUES (?,?,4,'final',?,?,?,?,'scheduled',0)",id(),m.tournament_id,rank[0].team,rank[1].team,rank[2]?.team||null,m.overs);await run("UPDATE tournaments SET status='final_ready' WHERE id=?",m.tournament_id)}
    }else if(m.stage==="final"||(await one<{team_count:number}>("SELECT team_count FROM tournaments WHERE id=?",m.tournament_id))?.team_count===2&&league.every(x=>x.id===mid||x.status==="complete")){
      const all=await rows<Delivery>("SELECT d.* FROM deliveries d JOIN matches m ON m.id=d.match_id WHERE m.tournament_id=? AND d.active=1",m.tournament_id);
      const players=await rows<{player_id:string}>("SELECT DISTINCT player_id FROM team_members WHERE tournament_id=?",m.tournament_id);
      const ranked=players.map(x=>({playerId:x.player_id,...playerImpact(all,x.player_id)})).sort((a,b)=>b.impact-a.impact||a.playerId.localeCompare(b.playerId));
      const commands=[db().prepare("UPDATE tournaments SET status='complete' WHERE id=?").bind(m.tournament_id)];
      if(ranked[0])commands.push(db().prepare("INSERT INTO awards (id,tournament_id,match_id,kind,player_id,impact,explanation,created_at) VALUES (?,?,NULL,'POTT',?,?,?,?)").bind(id(),m.tournament_id,ranked[0].playerId,ranked[0].impact,JSON.stringify(ranked[0]),now()));
      await db().batch(commands);
    }
    result={winner,result:resultText,first:oneScore,second:twoScore};
  } else throw new Error("Unknown action.");
  return Response.json({result});
}catch(e){return fail(e instanceof Error?e.message:"Unable to save this change.",e instanceof SyntaxError?400:400)}}

async function validateRoles(m:{id:string;tournament_id?:string;batting_first:string|null;team_a:string;team_b:string},innings:number,striker:string,non:string,bowler:string){
  const first=m.batting_first,batting=innings===1?first:first===m.team_a?m.team_b:m.team_a,bowling=batting===m.team_a?m.team_b:m.team_a;
  const tm=await rows<{player_id:string;team:string}>("SELECT player_id,team FROM team_members WHERE tournament_id=(SELECT tournament_id FROM matches WHERE id=?)",m.id);
  if(!tm.some(x=>x.player_id===striker&&x.team===batting)||!tm.some(x=>x.player_id===non&&x.team===batting)||!tm.some(x=>x.player_id===bowler&&x.team===bowling))throw new Error("Batters and bowler must belong to their playing teams.");
}

async function validateFielder(m:{id:string;tournament_id:string;batting_first:string|null;team_a:string;team_b:string},innings:number,wicketType:string,fielderId:unknown){
  if(!["caught","run_out","stumped"].includes(wicketType))return;
  const fid=requireValue(fielderId,"Fielder"),batting=innings===1?m.batting_first:m.batting_first===m.team_a?m.team_b:m.team_a,fielding=batting===m.team_a?m.team_b:m.team_a;
  const eligible=await one("SELECT 1 FROM team_members WHERE tournament_id=? AND team=? AND player_id=?",m.tournament_id,fielding,fid)
    ||await one("SELECT 1 FROM substitute_assignments WHERE match_id=? AND fielding_team=? AND player_id=? AND active=1",m.id,fielding,fid);
  if(!eligible)throw new Error("Fielder must be on the fielding team or an assigned substitute.");
}
