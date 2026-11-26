'use client';
import {useEffect,useState} from 'react';
import type {DeskItem} from '@/lib/judging/model';
import ProjectMaterials from '@/components/ProjectMaterials';
import {total} from '@/lib/judging/model';
import '@/components/judging.css';

async function request(path:string,body?:object){
  const res=await fetch('/api/evaluation/'+path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed.');return data;
}
export default function JudgePortal({embedded=false}:{embedded?:boolean}){
  const [items,setItems]=useState<DeskItem[]>([]),[authed,setAuthed]=useState(false),[invite,setInvite]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  const [event,setEvent]=useState(''),[round,setRound]=useState('');
  async function refresh(){try{const d=await request('desk');setItems(d.items);setAuthed(true);setMsg('');}catch(e){setItems([]);setAuthed(false);setMsg(e instanceof Error?e.message:'Sign in again.');}}
  useEffect(()=>{const invitation=location.hash.slice(1);
    const init=window.setTimeout(()=>{if(invitation){setInvite(invitation);history.replaceState(null,'',location.pathname);}void refresh();},0);
    const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},60000);
    window.addEventListener('focus',refresh);return()=>{clearInterval(timer);clearTimeout(init);window.removeEventListener('focus',refresh);};
  },[]);
  async function enter(){setBusy(true);try{await request('session',{invite:invite.trim().split('#').at(-1)});setInvite('');setMsg('');await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Invitation failed.');}finally{setBusy(false);}}
  const events=new Map(items.map(i=>[i.eventId,i.event]));
  const eventId=events.has(event)?event:events.keys().next().value;
  const rounds=new Map(items.filter(i=>i.eventId===eventId).map(i=>[i.round.id,i.round.name]));
  const roundId=rounds.has(round)?round:rounds.keys().next().value;
  const [candidate,setCandidate]=useState('');
  const tasks=items.filter(i=>i.eventId===eventId && i.round.id===roundId);
  const selected=tasks.find(i=>i.evaluation.id===candidate)??tasks[0];
  return <section className="judging" style={embedded?{minHeight:0}:undefined}><header><small>CampusOS / Competition judging</small>{embedded?<h2>Round evaluations</h2>:<h1>Judge Portal</h1>}<p>Review your assigned projects and submit a rubric for each team.</p></header>
    {msg && <p role="status">{msg}</p>}
    {(!authed || invite) && <form onSubmit={ev=>{ev.preventDefault();void enter();}}>
      <p>Your organiser’s round invitation unlocks the candidate selector, submission materials and scoring rubric.</p>
      <label>Round invitation link<input type="password" autoComplete="off" placeholder="Paste the private link from your organiser" required value={invite} onChange={ev=>setInvite(ev.target.value)}/></label>
      <button disabled={busy || !invite.trim()}>Accept judge invitation</button></form>}
    {authed && eventId==='cluster4-build24' && tasks.some(t=>t.round.id==='cluster4-final') && <a href="/cluster4">Live event workflow →</a>}
    {authed && <><div className="judging-row"><button onClick={()=>void refresh()}>Refresh assignments</button><button onClick={async()=>{const r=await fetch('/api/evaluation/session',{method:'DELETE'});if(r.ok){setItems([]);setAuthed(false);setMsg('Signed out. Request a new invitation for your next session.');}}}>Sign out of round evaluations</button></div>
      {!items.length?<p>No teams assigned yet. Refresh after your organiser assigns a team.</p>:<>
      <div className="judging-grid"><label>Event<select value={eventId} onChange={e=>setEvent(e.target.value)}>{[...events].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Round<select value={roundId} onChange={e=>setRound(e.target.value)}>{[...rounds].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div>
      <p>{tasks.filter(i=>!i.evaluation.submittedAt).length} pending evaluations · {tasks.filter(i=>!i.project).length} awaiting team submission · {tasks.filter(i=>i.evaluation.submittedAt).length} submitted</p>
      <label>Candidate or team<select value={selected?.evaluation.id??''} onChange={ev=>setCandidate(ev.target.value)}>{tasks.map(t=><option key={t.evaluation.id} value={t.evaluation.id}>{t.members.length===1?t.members[0]:t.team} · {t.project?.title??'Awaiting submission'}</option>)}</select></label>
      {tasks.map(task=><div key={task.evaluation.id} hidden={task!==selected}><ScoreCard key={task.evaluation.revision} item={task} refresh={refresh}/></div>)}</>}</>}
  </section>;
}
function ScoreCard({item,refresh}:{item:DeskItem;refresh:()=>Promise<void>}){
  const {evaluation:e,round:r,project:p}=item;
  const [marks,setMarks]=useState(e.marks),[strengths,setStrengths]=useState(e.strengths),[weaknesses,setWeaknesses]=useState(e.weaknesses),[feedback,setFeedback]=useState(e.feedback);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const tick=window.setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(tick);},[]);
  const locked=!!e.submittedAt||r.status!=='open'||now<Date.parse(r.start)||now>Date.parse(r.deadline);
  async function save(action:string){setBusy(true);setError('');try{
    await request('desk',{action,eventId:item.eventId,evaluationId:e.id,revision:e.revision,marks,strengths,weaknesses,feedback});await refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save.');}finally{setBusy(false);}}
  return <article className="judging-card"><h2>{item.team}</h2><p>{item.members.join(' · ')}</p><p>{r.description}</p><p>Round {new Date(r.start).toLocaleString()} – {new Date(r.end).toLocaleString()} · Evaluation due {new Date(r.deadline).toLocaleString()}</p>
    {p?<><h3>{p.title}</h3><p>{p.description}</p>{p.problem && <p><strong>Problem statement</strong> · {p.problem}</p>}
      <ProjectMaterials links={p.links} files={p.files}/>
      <fieldset disabled={locked||busy}><div className="judging-grid">{r.criteria.map(c=><label key={c.id}>{c.name} / {c.maxScore}<input type="number" min={0} max={c.maxScore} step="any" value={marks[c.id]??''}
        onChange={ev=>{const next={...marks};if(ev.target.value==='')delete next[c.id];else next[c.id]=Number(ev.target.value);setMarks(next);}}/></label>)}</div>
      <strong>Total {total(marks)} / {r.criteria.reduce((sum,c)=>sum+c.maxScore,0)}</strong>
      <label>Strengths<textarea value={strengths} onChange={ev=>setStrengths(ev.target.value)}/></label>
      <label>Weaknesses<textarea value={weaknesses} onChange={ev=>setWeaknesses(ev.target.value)}/></label>
      <label>Written feedback<textarea value={feedback} onChange={ev=>setFeedback(ev.target.value)}/></label>
      <button onClick={()=>void save('draft')}>Save draft</button> <button onClick={()=>void save('submit')}>Submit final evaluation</button></fieldset>
      <p role="status">{error||(e.submittedAt?'Submitted '+new Date(e.submittedAt).toLocaleString():e.revision?'Draft open':'Pending evaluation')}</p></>:<p>Waiting for team submission.</p>}</article>;
}
