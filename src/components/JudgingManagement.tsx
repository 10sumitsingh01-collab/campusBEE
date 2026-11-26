'use client';
import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import type {CampusEvent,RubricCriterion} from '@/types/domain';
import {standings,total} from '@/lib/judging/model';
import type {Round,Evaluation,EntryTeam,PanelJudge} from '@/lib/judging/model';
import './judging.css';

type Panel={rounds:Round[]; judges:Pick<PanelJudge,'id'|'name'|'revoked'>[];evaluations:Evaluation[];teams:EntryTeam[];revision:number};
type CriterionInput={name:string;maxScore:number};
const initialCriteria=[{name:'Overall quality',maxScore:100}];
const date=(s:string)=>new Date(s).toLocaleString();
function fields(e:FormEvent<HTMLFormElement>){e.preventDefault();return Object.fromEntries(new FormData(e.currentTarget));}

export default function JudgingManagement({events,initialEventId}:{events:CampusEvent[];initialEventId:string}){
  const [event,setEvent]=useState(initialEventId||events[0]?.id||'');
  const eventId=events.some(e=>e.id===event)?event:events[0]?.id??'';
  return <section className="judging"><header><h1>Judging Management</h1><p>Set up rounds, invite your panel and release competition results.</p></header>
    {eventId?<><label>Competition<select value={eventId} onChange={e=>setEvent(e.target.value)}>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>{eventId==='cluster4-build24' && <a href="/cluster4">Live event workflow →</a>}<Management key={eventId} eventId={eventId}/></>:<p>Create an event for your club to configure judging.</p>}</section>;
}
function Management({eventId}:{eventId:string}){
  const [panel,setPanel]=useState<Panel|null>(null),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState(''),[notice,setNotice]=useState(''),[invite,setInvite]=useState(''),[busy,setBusy]=useState(false);
  const [criteria,setCriteria]=useState<CriterionInput[]>(initialCriteria);
  useEffect(()=>{let active=true;fetch('/api/events/'+eventId+'/rubric').then(r=>r.json()).then(d=>{
    if(active && d.criteria?.length)setCriteria(d.criteria.map((c:RubricCriterion)=>({name:c.name,maxScore:c.maxScore})));
  }).catch(()=>{});return()=>{active=false;};},[eventId]);
  useEffect(()=>{let active=true;fetch('/api/evaluation/manage?eventId='+encodeURIComponent(eventId),{cache:'no-store'}).then(async r=>{
    const d=await r.json();if(!r.ok)throw Error(d.error);if(active)setPanel(d);
  }).catch(e=>{if(active)setNotice(e.message);});return()=>{active=false;};},[eventId,refresh]);
  const r=panel?.rounds.find(r=>r.id===selected)??panel?.rounds.at(-1);
  async function change(action:string,data:Record<string,unknown>={}){
    if(busy||!panel)return;setBusy(true);setNotice('');
    try{
      const res=await fetch('/api/evaluation/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId,revision:panel.revision,roundId:r?.id,...data,action})});
      const result=await res.json();if(!res.ok)throw Error(result.error);
      if(result.invite)setInvite(location.origin+'/judge'+(document.cookie.split('; ').includes('campusbee_demo=1') ? '?workspace=demo' : '')+'#'+result.invite);
      if(action==='revoke')setInvite('');
      if(action==='round')setSelected('');
      setNotice(action==='publish'?'Results published.':'Changes saved.');
    }catch(e){setNotice(e instanceof Error?e.message:'Could not save changes.');}
    finally{setBusy(false);setRefresh(v=>v+1);}
  }
  return <><p role="status">{notice}</p><button onClick={()=>setRefresh(v=>v+1)}>Refresh judging data</button>
    {panel && <fieldset disabled={busy}><details className="judging-card" open={!panel.rounds.length}><summary>Create a round</summary>
      <form onSubmit={e=>{const d=fields(e);void change('round',{...d,anonymous:d.anonymous==='on',criteria,
        start:new Date(String(d.start)).toISOString(),end:new Date(String(d.end)).toISOString(),deadline:new Date(String(d.deadline)).toISOString()});}}>
        <label>Round name<input name="name" required/></label><label>Description<textarea name="description"/></label>
        <div className="judging-grid">{[['start','Start'],['end','End'],['deadline','Evaluation deadline']].map(([key,label])=><label key={key}>{label}<input name={key} type="datetime-local" required/></label>)}</div>
        <label>Scoring rule<select name="method"><option value="average">Average of judge totals</option><option value="weighted">Weighted average of judge totals</option></select></label>
        <label><input type="checkbox" name="anonymous"/> Anonymous evaluation</label>
        <h3>Evaluation criteria</h3>{criteria.map((c,i)=><div className="judging-grid" key={i}>
          <label>Criterion {i+1}<input required value={c.name} onChange={e=>setCriteria(cs=>cs.map((x,n)=>n===i?{...x,name:e.target.value}:x))}/></label>
          <label>Maximum marks<input required type="number" min=".01" step=".01" value={c.maxScore||''} onChange={e=>setCriteria(cs=>cs.map((x,n)=>n===i?{...x,maxScore:Number(e.target.value)}:x))}/></label>
          {criteria.length>1 && <button type="button" onClick={()=>setCriteria(cs=>cs.filter((_,n)=>n!==i))}>Remove criterion</button>}</div>)}
        <div><button type="button" onClick={()=>setCriteria(cs=>[...cs,{name:'',maxScore:10}])}>Add criterion</button> <button>Create round</button></div>
      </form></details>
      <section className="judging-card"><h2>Judge invitations</h2><form onSubmit={e=>void change('invite',fields(e))}>
        <label>Judge name<input name="name" required/></label><button>Create invitation</button></form>
        {invite && <label>Private single-use link · share directly with this judge<input readOnly value={invite} onFocus={e=>e.target.select()}/></label>}
        {panel.judges.map(j=><div key={j.id} className="judging-row"><strong>{j.name}{j.revoked?' · Revoked':''}</strong><button onClick={()=>void change('reissue',{judgeId:j.id})}>Issue new link</button>
        {!j.revoked && <button onClick={()=>void change('revoke',{judgeId:j.id})}>Revoke access</button>}</div>)}
      </section>
      {r && <><label>Judging round<select value={r.id} onChange={e=>setSelected(e.target.value)}>{panel.rounds.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <section className="judging-card"><h2>{r.name}</h2><p>{r.description}</p><p>{date(r.start)} – {date(r.end)} · Evaluations due {date(r.deadline)}</p>
          <p>{r.anonymous?'Anonymous judging':'Named teams'} · {r.status} · {r.method==='weighted'?'Weighted average':'Average'}</p>
          {r.status==='open' && <details><summary>Extend evaluation deadline</summary><form onSubmit={e=>{const d=fields(e);void change('extend',{deadline:new Date(String(d.deadline)).toISOString()});}}>
            <label>New deadline<input type="datetime-local" name="deadline" required/></label><button>Save deadline</button></form></details>}
          {r.status==='open' && <form key={r.id} onSubmit={e=>{const d=fields(e);void change('assign',{...d,weight:Number(d.weight??1)});}}>
            <label>Participating team<select name="teamId" required><option value="">Choose team</option>{panel.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Panel judge<select name="judgeId" required><option value="">Choose judge</option>{panel.judges.filter(j=>!j.revoked).map(j=><option key={j.id} value={j.id}>{j.name}</option>)}</select></label>
            {r.method==='weighted' && <label>Judge weight<input type="number" name="weight" min=".01" max="100" step=".01" defaultValue="1" required/></label>}
            {r.anonymous && <><label>De-identified project brief<textarea name="brief" placeholder="Required on first assignment. Include the problem, approach and evidence without names."/></label>
            <label>De-identified presentation URL (optional)<input name="artifact" type="url"/></label></>}
            <button>Assign team to judge</button></form>}
        </section>
        <section className="judging-card"><h2>Evaluation progress</h2>
        {panel.evaluations.filter(e=>e.roundId===r.id).map(e=><details key={e.id}><summary>{panel.teams.find(t=>t.id===e.teamId)?.name} · {panel.judges.find(j=>j.id===e.judgeId)?.name} · {e.submittedAt?'Submitted':Object.keys(e.marks).length?'Draft':'Pending'}</summary>
          <p>{r.criteria.map(c=>c.name+' '+(e.marks[c.id]??'—')+'/'+c.maxScore).join(' · ')}</p><p>Total {total(e.marks)} · Weight {e.weight}</p>
          {!e.submittedAt && r.status==='open' && <button onClick={()=>void change('unassign',{evaluationId:e.id})}>Remove assignment</button>}
          {e.submittedAt && <><p>Submitted {date(e.submittedAt)}</p><p>Strengths · {e.strengths}</p><p>Weaknesses · {e.weaknesses}</p><p>Feedback · {e.feedback}</p>
          {r.status==='open' && <button onClick={()=>void change('reopen',{evaluationId:e.id})}>Reopen evaluation</button>}</>}</details>)}
        <h2>Round standings</h2><p>Score differences of at least 20% of the available marks are flagged for review.</p>{standings(r,panel.evaluations).map(row=><p key={row.teamId}>{row.rank??'—'}. {panel.teams.find(t=>t.id===row.teamId)?.name} · {row.average?.toFixed(2)??'—'} / {row.maximum} · {row.pending} pending
          {row.spread>=.2 && <strong> · Judge spread {Math.round(row.spread*100)}% of maximum</strong>}</p>)}
          {r.status==='open' && <button onClick={()=>void change('finalize')}>Finalize round results</button>}
          {r.status==='finalized' && <button onClick={()=>void change('publish')}>Publish round results</button>}
        </section></>}
    </fieldset>}</>;
}
