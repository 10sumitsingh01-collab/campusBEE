import {NextRequest} from 'next/server';
import {readInput,fail,Fault,load,persist,principal,respond,teams} from '@/lib/server/competition';
import type {DeskItem} from '@/lib/judging/model';
export async function GET(req:NextRequest){return respond(async()=>{
  const items:DeskItem[]=[];let sessions=0;
  for(const c of req.cookies.getAll().filter(c=>c.name.startsWith('judge_access_'))){
    try{
      const w=await load(c.name.slice(13));const j=principal(req,w);sessions++;
      const assigned=w.state.evaluations.filter(e=>e.judgeId===j.id);
      const entrants=await teams(w.eventId,assigned.map(e=>e.teamId));
      for(const e of assigned){
        const r=w.state.rounds.find(r=>r.id===e.roundId)!;const t=entrants.find(t=>t.id===e.teamId);if(!t)continue;
        const entry=r.entries.find(t=>t.teamId===e.teamId)!;
        const {id,name,description,start,end,deadline,criteria,status}=r;
        const {teamId,...evaluation}=e;void teamId;
        items.push({eventId:w.eventId,event:w.title,round:{id,name,description,start,end,deadline,criteria,status},evaluation,
          team:r.anonymous?entry.alias:t.name,members:r.anonymous?[]:t.members,project:r.anonymous && t.project?
          {title:entry.alias,description:entry.brief,problem:'',links:[],files:entry.artifact?[entry.artifact]:[]}:t.project});
      }
    }catch(err){if(!(err instanceof Fault && [401,404].includes(err.status)))throw err;}
  }
  if(!sessions)fail(401,'Open your organiser’s invitation to access assigned evaluations.');
  return {items};
});}
export async function POST(req:NextRequest){return respond(async()=>{
  const b=await readInput(req);const w=await load(String(b.eventId));const j=principal(req,w);
  const e=w.state.evaluations.find(e=>e.id===b.evaluationId && e.judgeId===j.id);
  if(!e)fail(403,'This evaluation is not assigned to you.');
  const r=w.state.rounds.find(r=>r.id===e.roundId)!;
  if(e.submittedAt||r.status!=='open'||b.revision!==e.revision)fail(409,'Evaluation locked or changed. Refresh your desk.');
  if(Date.now()<Date.parse(r.start)||Date.now()>Date.parse(r.deadline))fail(409,'Outside the evaluation window.');
  if(!(await teams(w.eventId,[e.teamId]))[0]?.project)fail(409,'Waiting for the team submission.');
  if(!['draft','submit'].includes(b.action)||!b.marks||typeof b.marks!=='object'||Array.isArray(b.marks))fail(400,'Invalid evaluation.');
  for(const [k,v] of Object.entries(b.marks)){
    const c=r.criteria.find(c=>c.id===k);
    if(!c||typeof v!=='number'||!Number.isFinite(v)||v<0||v>c.maxScore)fail(400,'A criterion score is outside its range.');
  }
  if(b.action==='submit' && Object.keys(b.marks).length!==r.criteria.length)fail(400,'Score every criterion before submitting.');
  for(const key of ['strengths','weaknesses','feedback'] as const){
    if(typeof b[key]!=='string'||b[key].length>8000)fail(400,'Feedback fields must be text of at most 8000 characters.');
    e[key]=b[key];
  }
  e.marks=b.marks;e.revision++;e.submittedAt=b.action==='submit'?new Date().toISOString():null;
  await persist(w);return {saved:true,submittedAt:e.submittedAt};
});}
