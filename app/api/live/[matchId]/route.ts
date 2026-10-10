import { getDatabase } from "@/db/adapter";
export const runtime="nodejs";
import { inningsScore, overs, playerImpact, standings, type Delivery } from "@/lib/cricket";

export const dynamic = "force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{matchId:string}>}){
  try{
    const {matchId}=await params;
    const m=await getDatabase().prepare("SELECT m.*,t.public_enabled,t.win_points AS winPoints,t.tie_points AS tiePoints,t.no_result_points AS noResultPoints FROM matches m JOIN tournaments t ON t.id=m.tournament_id WHERE m.id=?").bind(matchId).first<any>();
    if(!m||!m.public_enabled)return Response.json({error:"Live score is not public"},{status:404});
    const ds=(await getDatabase().prepare("SELECT * FROM deliveries WHERE match_id=? AND active=1 ORDER BY sequence").bind(matchId).all<Delivery>()).results||[];
    const players=(await getDatabase().prepare("SELECT p.id,p.short_name,p.name,tm.team FROM players p JOIN team_members tm ON tm.player_id=p.id WHERE tm.tournament_id=? AND tm.team IN (?,?)").bind(m.tournament_id,m.team_a,m.team_b).all<{id:string;short_name:string;name:string;team:string}>()).results||[];
    const [first,second]=[inningsScore(ds,1),inningsScore(ds,2)],inning=m.status==="innings2"||m.status==="complete"?2:1;
    const current=inning===1?first:second,batting=inning===1?m.batting_first:m.batting_first===m.team_a?m.team_b:m.team_a;
    const target=inning===2?first.runs+1:null,ballsRemaining=Math.max(0,m.overs*6-current.balls);
    const matchList=(await getDatabase().prepare("SELECT * FROM matches WHERE tournament_id=? AND stage='league'").bind(m.tournament_id).all<any>()).results||[];
    const tournamentBalls=(await getDatabase().prepare("SELECT d.*,m.id AS match_id FROM deliveries d JOIN matches m ON m.id=d.match_id WHERE m.tournament_id=? AND d.active=1").bind(m.tournament_id).all<any>()).results||[];
    const recent=current.rows.slice(-8).map(d=>({id:d.id,runs:d.bat_runs+d.extra_runs,wicket:!!d.wicket,extraType:d.extra_type}));
    const player=(id:string|null)=>players.find(p=>p.id===id)?.short_name||null;
    const impacts=players.map(p=>({name:p.short_name,team:p.team,...playerImpact(ds,p.id)})).filter(x=>x.runs||x.wickets||x.catches);
    return Response.json({match:{id:m.id,number:m.number,stage:m.stage,teamA:m.team_a,teamB:m.team_b,status:m.status,result:m.result,tossWinner:m.toss_winner,tossChoice:m.toss_choice,overs:m.overs},
      first:{runs:first.runs,wickets:first.wickets,overs:overs(first.balls)},second:{runs:second.runs,wickets:second.wickets,overs:overs(second.balls)},
      current:{team:batting,runs:current.runs,wickets:current.wickets,overs:overs(current.balls),legalBalls:current.balls,target,need:target===null?null:Math.max(0,target-current.runs),ballsRemaining,
        currentRate:current.balls?+(current.runs*6/current.balls).toFixed(2):0,requiredRate:target!==null&&ballsRemaining?+(Math.max(0,target-current.runs)*6/ballsRemaining).toFixed(2):null,
        striker:player(m.striker_id),nonstriker:player(m.nonstriker_id),bowler:player(m.bowler_id),recent},
      standings:standings(matchList,tournamentBalls,m).map(r=>({team:r.team,P:r.P,PTS:r.PTS,NRR:r.NRR})),impacts,updatedAt:new Date().toISOString()});
  }catch{return Response.json({error:"Unable to load live score"},{status:500})}
}
