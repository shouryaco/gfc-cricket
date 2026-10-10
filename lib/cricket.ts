export type Player = { id:string; name:string; short_name:string; grade:"A"|"B"|"C"; role:string; batting:number; bowling:number; fielding:number; keeping:number; active:number };
export type Team = { name:string; captainId:string; playerIds:string[] };
export type Delivery = { id:string; innings:number; sequence:number; striker_id:string; nonstriker_id:string; bowler_id:string; bat_runs:number; extra_type:string; extra_runs:number; wicket:number; dismissed_id:string|null; wicket_type:string|null; fielder_id:string|null; legal:number; active:number };
export const gradePoints:Record<string,number>={A:90,B:65,C:40};
export function strength(p:Player){return p.batting*.32+p.bowling*.32+p.fielding*.21+(gradePoints[p.grade]||40)*.1+(p.keeping||0)*.05}
export function metrics(team:Team,players:Player[]){const a=team.playerIds.map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[];
  return {count:a.length,overall:Math.round(a.reduce((s,p)=>s+strength(p),0)),batting:a.reduce((s,p)=>s+p.batting,0),bowling:a.reduce((s,p)=>s+p.bowling,0),fielding:a.reduce((s,p)=>s+p.fielding,0),keeping:a.reduce((s,p)=>s+p.keeping,0),A:a.filter(p=>p.grade==="A").length,B:a.filter(p=>p.grade==="B").length,C:a.filter(p=>p.grade==="C").length,bowlers:a.filter(p=>p.bowling>=60).length};}
export function balance(teams:Team[],players:Player[]){const m=teams.map(t=>metrics(t,players)); if(!m.length)return {score:0,parts:{},metrics:m};
  // Compare skill density when roster sizes differ by one, while retaining raw totals for organisers.
  const calc=(key:keyof typeof m[number])=>{const v=m.map(x=>(x[key] as number)/Math.max(1,x.count)),mean=v.reduce((a,b)=>a+b,0)/v.length;return mean?Math.max(0,100-120*(Math.max(...v)-Math.min(...v))/mean):100};
  const counts=m.map(x=>x.count),countScore=Math.max(...counts)-Math.min(...counts)<=1?100:Math.max(0,100-25*(Math.max(...counts)-Math.min(...counts)-1));
  const parts={overall:calc("overall"),batting:calc("batting"),bowling:calc("bowling"),fielding:calc("fielding"),count:countScore,grade:(calc("A")+calc("B")+calc("C"))/3,roles:calc("bowlers")};
  const score=Math.round(parts.overall*.3+parts.batting*.2+parts.bowling*.2+parts.count*.1+parts.fielding*.1+parts.grade*.05+parts.roles*.05);
  return {score,parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,Math.round(v)])),metrics:m};
}
export function generateTeams(pool:Player[],captains:string[],teamCount:number){if(captains.length!==teamCount||new Set(captains).size!==teamCount)throw new Error("Select one different available captain for each team.");
  if(pool.length<teamCount*2)throw new Error("Add at least two players per team.");
  const caps=captains.map(id=>pool.find(p=>p.id===id)); if(caps.some(c=>!c))throw new Error("Captains must be available players.");
  const names=["Team A","Team B","Team C"].slice(0,teamCount), limits=names.map((_,i)=>Math.floor(pool.length/teamCount)+(i<pool.length%teamCount?1:0));
  const initial:Team[]=names.map((name,i)=>({name,captainId:captains[i],playerIds:[captains[i]]}));
  const rest=pool.filter(p=>!captains.includes(p.id)).sort((a,b)=>strength(b)-strength(a));
  for(const p of rest){let best=0,bestCost=Infinity;for(let i=0;i<teamCount;i++){if(initial[i].playerIds.length>=limits[i])continue;initial[i].playerIds.push(p.id);const cost=(100-balance(initial,pool).score)+initial[i].playerIds.length/limits[i]*2;initial[i].playerIds.pop();if(cost<bestCost){best=i;bestCost=cost}}initial[best].playerIds.push(p.id)}
  let current=initial; let score=balance(current,pool).score;
  for(let pass=0;pass<12;pass++){let improved=false;search:for(let a=0;a<teamCount;a++)for(let b=a+1;b<teamCount;b++)for(const pa of current[a].playerIds)for(const pb of current[b].playerIds){if(captains.includes(pa)||captains.includes(pb))continue;
    const next=current.map(t=>({...t,playerIds:[...t.playerIds]}));next[a].playerIds[next[a].playerIds.indexOf(pa)]=pb;next[b].playerIds[next[b].playerIds.indexOf(pb)]=pa;
    const s=balance(next,pool).score;if(s>score){current=next;score=s;improved=true;break search}}if(!improved)break}
  return {teams:current,...balance(current,pool)};
}
export function inningsScore(ds:Delivery[],innings:number){const rows=ds.filter(d=>d.active&&d.innings===innings).sort((a,b)=>a.sequence-b.sequence);return {runs:rows.reduce((s,d)=>s+d.bat_runs+d.extra_runs,0),wickets:rows.reduce((s,d)=>s+d.wicket,0),balls:rows.reduce((s,d)=>s+d.legal,0),rows};}
export function overs(balls:number){return `${Math.floor(balls/6)}.${balls%6}`}
export function playerImpact(ds:Delivery[],playerId:string){const rows=ds.filter(d=>d.active),runs=rows.filter(d=>d.striker_id===playerId).reduce((s,d)=>s+d.bat_runs,0);
  const balls=rows.filter(d=>d.striker_id===playerId&&!["wide","no_ball"].includes(d.extra_type)).length;
  const wickets=rows.filter(d=>d.bowler_id===playerId&&d.wicket&&!["run_out","retired_out"].includes(d.wicket_type||"")).length;
  const catches=rows.filter(d=>d.fielder_id===playerId&&d.wicket_type==="caught").length;
  const runouts=rows.filter(d=>d.fielder_id===playerId&&d.wicket_type==="run_out").length;
  const boundaries=rows.filter(d=>d.striker_id===playerId&&(d.bat_runs===4||d.bat_runs===6)).length;
  return {runs,balls,wickets,catches,runouts,impact:runs+wickets*20+catches*10+runouts*15+boundaries*2};}
export function standings(ms:Array<{team_a:string|null;team_b:string|null;stage:string;status:string;winner:string|null;result:string|null;overs:number;id:string;batting_first?:string|null;first_all_out?:number;second_all_out?:number}>,ds:Delivery[],rules:{winPoints?:number;tiePoints?:number;noResultPoints?:number}={}){
  const teams=[...new Set(ms.flatMap(m=>[m.team_a,m.team_b]).filter(Boolean))] as string[];
  const rows=teams.map(team=>({team,P:0,W:0,L:0,T:0,NR:0,PTS:0,forRuns:0,forBalls:0,againstRuns:0,againstBalls:0,NRR:0}));
  for(const m of ms.filter(x=>x.stage==="league"&&x.status==="complete")){
    const a=rows.find(x=>x.team===m.team_a),b=rows.find(x=>x.team===m.team_b);if(!a||!b)continue;
    a.P++;b.P++;if(m.winner){const w=m.winner===a.team?a:b,l=w===a?b:a;w.W++;w.PTS+=rules.winPoints??2;l.L++}else if(m.result==="Tie"){a.T++;b.T++;a.PTS+=rules.tiePoints??1;b.PTS+=rules.tiePoints??1}else{a.NR++;b.NR++;a.PTS+=rules.noResultPoints??1;b.PTS+=rules.noResultPoints??1;continue}
    const scores=[inningsScore(ds.filter(d=>(d as Delivery&{match_id?:string}).match_id===m.id),1),inningsScore(ds.filter(d=>(d as Delivery&{match_id?:string}).match_id===m.id),2)];
    const first=(m as typeof m&{batting_first?:string|null}).batting_first;const r1=first===a.team?a:b,r2=r1===a?b:a;
    const quota=m.overs*6;
    const balls1=m.first_all_out?quota:scores[0].balls,balls2=m.second_all_out?quota:scores[1].balls;
    r1.forRuns+=scores[0].runs;r1.forBalls+=balls1;r2.againstRuns+=scores[0].runs;r2.againstBalls+=balls1;
    r2.forRuns+=scores[1].runs;r2.forBalls+=balls2;r1.againstRuns+=scores[1].runs;r1.againstBalls+=balls2;
  }
  for(const r of rows)r.NRR=r.forBalls&&r.againstBalls?+(r.forRuns*6/r.forBalls-r.againstRuns*6/r.againstBalls).toFixed(3):0;
  return rows.sort((a,b)=>{const main=b.PTS-a.PTS||b.NRR-a.NRR;if(main)return main;
    const head=ms.filter(m=>m.stage==="league"&&m.status==="complete"&&[a.team,b.team].includes(m.team_a||"")&&[a.team,b.team].includes(m.team_b||""));
    const winsA=head.filter(m=>m.winner===a.team).length,winsB=head.filter(m=>m.winner===b.team).length;
    return winsB-winsA||a.team.localeCompare(b.team)});
}
