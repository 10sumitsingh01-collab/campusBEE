import 'server-only';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';
import {getRequestUser,canManageClub,sessionDigest} from './authGuard';
import {getDataMode,getStore,saveDemoStore} from './store';
import type {Competition,EntryTeam,PanelJudge,Project} from '@/lib/judging/model';
import type {Submission} from '@/types/domain';
export class Fault extends Error {constructor(public status:number,message:string){super(message)}}
export function fail(status:number,message:string):never{throw new Fault(status,message);}
export async function respond(work:()=>Promise<unknown>){try{return NextResponse.json(await work(),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Fault?e.message:'Unable to load or save competition data.'},{status:e instanceof Fault?e.status:503});}}
export async function readInput(req:NextRequest){
  if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use application/json.');
  const origin=req.headers.get('origin');
  if(origin && new URL(origin).host!==req.headers.get('host'))fail(403,'Cross-origin request denied.');
  const input=await req.json().catch(()=>null);
  if(!input || typeof input!=='object' || Array.isArray(input))fail(400,'Invalid request.');
  return input;
}
export const id=()=>randomUUID();
export const token=()=>randomBytes(32).toString('base64url');
export const blank=():Competition=>({rounds:[],judges:[],evaluations:[]});
function db(){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)fail(503,'Configure the server database credential for competition judging.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function load(eventId:string){
  if(!/^[\w-]{1,80}$/.test(eventId))fail(400,'Invalid event.');
  if(getDataMode()==='local_seed'){
    const store=getStore(); const event=store.events.find(e=>e.id===eventId);if(!event)fail(404,'Event not found.');
    const row=store.competitions?.[eventId];
    return {eventId,title:event.title,clubId:event.clubId,revision:row?.revision??0,state:structuredClone(row?.state??blank())};
  }
  const client=db();
  const [event,row]=await Promise.all([client.from('events').select('id,title,club_id').eq('id',eventId).maybeSingle(),client.from('competition_workspaces').select('*').eq('event_id',eventId).maybeSingle()]);
  if(event.error||row.error)fail(503,'Competition storage unavailable. Check the judging migration.');
  if(!event.data)fail(404,'Event not found.');
  return {eventId,title:String(event.data.title),clubId:String(event.data.club_id),revision:Number(row.data?.revision??0),state:(row.data?.state??blank()) as Competition};
}
export type Workspace=Awaited<ReturnType<typeof load>>;
export async function persist(w:Workspace){
  const revision=w.revision+1;
  if(getDataMode()==='local_seed'){
    const store=getStore();store.competitions??={};
    if((store.competitions[w.eventId]?.revision??0)!==w.revision)fail(409,'The competition changed. Refresh and retry.');
    const updated={...store.competitions,[w.eventId]:{revision,state:w.state}};
    saveDemoStore({...store,competitions:updated});store.competitions=updated;return;
  }
  const table=db().from('competition_workspaces');
  const result=w.revision===0?await table.insert({event_id:w.eventId,revision,state:w.state}).select('revision').single()
    :await table.update({revision,state:w.state}).eq('event_id',w.eventId).eq('revision',w.revision).select('revision').maybeSingle();
  if(result.error || !result.data)fail(409,'Could not save this revision. Refresh and retry.');
}
export async function managed(req:NextRequest,eventId:string){
  const user=await getRequestUser(req);if(!user)fail(401,'Sign in as the event organiser.');
  if(user.role!=='club_organizer')fail(403,'Only the hosting organiser can manage judging.');
  const w=await load(eventId);
  if(getDataMode()==='local_seed'){if(!canManageClub(user,w.clubId))fail(403,'You do not manage this club.');}
  else {
    const client=db();
    const {data}=await client.from('club_members').select('role').eq('club_id',w.clubId).eq('user_id',user.id).eq('membership_status','active').in('role',['owner','lead']).maybeSingle();
    if(!data)fail(403,'You do not manage this club.');
  }
  return w;
}
export function safeUrl(value:unknown){if(typeof value!=='string')return '';try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function project(s:Pick<Submission,'title'|'description'|'problemStatement'|'links'|'fileUrls'>):Project{
  const links=Array.isArray(s.links)?s.links:[];
  return {title:s.title,description:s.description,problem:s.problemStatement??'',
    links:links.filter(l=>l.label!=='Problem statement' && safeUrl(l.url)),files:(s.fileUrls??[]).filter(safeUrl)};
}
export async function teams(eventId:string,only?:string[]):Promise<EntryTeam[]>{
  if(only && !only.length)return [];
  if(getDataMode()==='local_seed'){
    const s=getStore();return s.teams.filter(t=>t.eventId===eventId && (!only||only.includes(t.id))).map(t=>{
      const sub=s.submissions.find(p=>p.eventId===eventId && p.teamId===t.id);
      return {id:t.id,name:t.name,members:t.members.map(m=>m.name),project:sub?project(sub):null};
    });
  }
  const client=db();let tq=client.from('teams').select('id,name,team_members(status,users!team_members_user_id_fkey(name))').eq('event_id',eventId);
  let sq=client.from('submissions').select('team_id,title,description,problem_statement,links,file_urls').eq('event_id',eventId);
  if(only){tq=tq.in('id',only);sq=sq.in('team_id',only);}
  const [t,s]=await Promise.all([tq,sq]);if(t.error||s.error)fail(503,'Could not load event teams.');
  return (t.data??[]).map(team=>{const sub=s.data.find(row=>row.team_id===team.id);
    return {id:team.id,name:team.name,members:team.team_members.filter(m=>m.status==='accepted').map(m=>[m.users].flat()[0]?.name??'Team member'),project:sub?project({...sub,problemStatement:sub.problem_statement,fileUrls:sub.file_urls}):null};});
}
export const cookieName=(eventId:string)=>'judge_access_'+eventId;
export function principal(req:NextRequest,w:Workspace):PanelJudge{
  const raw=req.cookies.get(cookieName(w.eventId))?.value;
  const judge=raw && w.state.judges.find(j=>!j.revoked && j.sessionExpires>Date.now() && j.sessionHash===sessionDigest(raw));
  if(!judge)fail(401,'Judge access expired or was revoked. Ask your organiser for a new invitation.');
  return judge;
}
