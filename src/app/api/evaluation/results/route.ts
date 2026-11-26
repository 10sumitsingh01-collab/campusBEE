import {NextRequest} from 'next/server';
import {load,teams,respond} from '@/lib/server/competition';
import {standings} from '@/lib/judging/model';
export async function GET(req:NextRequest){return respond(async()=>{
  const w=await load(req.nextUrl.searchParams.get('eventId')??'');
  const published=w.state.rounds.filter(r=>r.status==='published');
  const entrants=await teams(w.eventId,published.flatMap(r=>r.entries.map(t=>t.teamId)));
  return {rounds:published.map(r=>({name:r.name,rows:standings(r,w.state.evaluations).map(row=>({rank:row.rank,team:entrants.find(t=>t.id===row.teamId)?.name,score:row.average,maximum:row.maximum}))}))};
});}
