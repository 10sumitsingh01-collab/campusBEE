import {NextRequest} from 'next/server';
import {readInput,fail,id,managed,persist,respond,safeUrl,teams,token} from '@/lib/server/competition';
import {sessionDigest} from '@/lib/server/authGuard';
import {standings} from '@/lib/judging/model';
const str=(v:unknown)=>typeof v==='string'?v.trim().slice(0,8000):'';
export async function GET(req:NextRequest){return respond(async()=>{
  const w=await managed(req,req.nextUrl.searchParams.get('eventId')??'');
  return {rounds:w.state.rounds,judges:w.state.judges.map(({id,name,revoked})=>({id,name,revoked})),evaluations:w.state.evaluations,teams:await teams(w.eventId),revision:w.revision};
});}
export async function POST(req:NextRequest){return respond(async()=>{
  const b=await readInput(req);const w=await managed(req,str(b.eventId));const s=w.state;
  if(b.revision!==w.revision)fail(409,'This workspace changed. Refresh before editing.');
  let invite:string|undefined;
  if(b.action==='round'){
    const start=Date.parse(b.start),end=Date.parse(b.end),deadline=Date.parse(b.deadline);
    if(!str(b.name)||![start,end,deadline].every(Number.isFinite)||end<=start||deadline<end)fail(400,'Provide a round name and ordered start, end and evaluation deadline.');
    if(!Array.isArray(b.criteria)||!b.criteria.length||b.criteria.length>50)fail(400,'Provide 1–50 rubric criteria.');
    const criteria=b.criteria.map((c:{name:string;maxScore:number})=>{
      if(!str(c.name)||!Number.isFinite(c.maxScore)||c.maxScore<=0||c.maxScore>10000)fail(400,'Each criterion needs a name and positive maximum.');
      return {id:id(),name:str(c.name),maxScore:c.maxScore};
    });
    s.rounds.push({id:id(),name:str(b.name),description:str(b.description),start:new Date(start).toISOString(),end:new Date(end).toISOString(),deadline:new Date(deadline).toISOString(),
      anonymous:b.anonymous===true,method:b.method==='weighted'?'weighted':'average',criteria,status:'open',entries:[]});
  }else if(['invite','reissue','revoke'].includes(b.action)){
    let judge=s.judges.find(j=>j.id===b.judgeId);
    if(b.action==='invite'){
      if(!str(b.name))fail(400,'Enter the judge name.');
      judge={id:id(),name:str(b.name),revoked:false,inviteHash:'',inviteExpires:0,sessionHash:'',sessionExpires:0};s.judges.push(judge);
    }
    if(!judge)fail(404,'Judge not found.');
    judge.revoked=b.action==='revoke';judge.sessionHash='';judge.sessionExpires=0;judge.inviteHash='';
    if(!judge.revoked){const secret=token();judge.inviteHash=sessionDigest(secret);judge.inviteExpires=Date.now()+7*86400000;invite=w.eventId+'.'+secret;}
  }else{
    const r=s.rounds.find(r=>r.id===b.roundId);if(!r)fail(404,'Round not found.');
    if(b.action==='publish'){if(r.status!=='finalized')fail(409,'Finalize the round first.');r.status='published';}
    else {
      if(r.status!=='open')fail(409,'This round has been finalized.');
      if(b.action==='assign'){
        const team=(await teams(w.eventId,[str(b.teamId)]))[0];
        const judge=s.judges.find(j=>j.id===b.judgeId && !j.revoked);
        if(!team||!judge)fail(400,'Select a participating team and active judge from this event.');
        if(!Number.isFinite(b.weight)||b.weight<=0||b.weight>100)fail(400,'Judge weight must be positive and at most 100.');
        if(s.evaluations.some(e=>e.roundId===r.id && e.judgeId===judge.id && e.teamId===team.id))fail(409,'This judge is already assigned.');
        if(!r.entries.some(t=>t.teamId===team.id)){
          if(r.anonymous && !str(b.brief))fail(400,'Supply a de-identified project brief for the judge.');
          if(str(b.artifact) && !safeUrl(b.artifact))fail(400,'Use an HTTP or HTTPS presentation link.');
          r.entries.push({teamId:team.id,alias:'Entry '+String(Math.max(0,...r.entries.map(t=>Number(t.alias.split(' ')[1])))+1).padStart(2,'0'),brief:str(b.brief),artifact:safeUrl(b.artifact)});
        }
        s.evaluations.push({id:id(),roundId:r.id,teamId:team.id,judgeId:judge.id,weight:b.weight,revision:0,marks:{},strengths:'',weaknesses:'',feedback:'',submittedAt:null});
      }else if(b.action==='unassign'){
        const evaluation=s.evaluations.find(e=>e.id===b.evaluationId && e.roundId===r.id);
        if(!evaluation || evaluation.submittedAt)fail(409,'Only pending evaluations can be unassigned.');
        s.evaluations=s.evaluations.filter(e=>e.id!==evaluation.id);
        if(!s.evaluations.some(e=>e.roundId===r.id && e.teamId===evaluation.teamId)){
          r.entries=r.entries.filter(t=>t.teamId!==evaluation.teamId);
        }
      }else if(b.action==='extend'){
        const deadline=Date.parse(b.deadline);
        if(!Number.isFinite(deadline)||deadline<=Date.parse(r.deadline))fail(400,'Choose a deadline later than the current deadline.');
        r.deadline=new Date(deadline).toISOString();
      }else if(b.action==='reopen'){
        const e=s.evaluations.find(e=>e.id===b.evaluationId&&e.roundId===r.id);
        if(!e?.submittedAt)fail(409,'Only submitted evaluations can be reopened.');
        e.submittedAt=null;e.revision++;
      }else if(b.action==='finalize'){
        const rows=standings(r,s.evaluations);if(!rows.length||rows.some(row=>!row.complete))fail(409,'Every assigned evaluation must be submitted first.');
        r.status='finalized';
      }else fail(400,'Unknown judging action.');
    }
  }
  await persist(w);return {saved:true,invite};
});}
