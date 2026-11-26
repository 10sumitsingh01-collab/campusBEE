'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import './workflow.css';

interface Activity {
  registeredCount:number; title:string; start:string; end:string; venue:string; capacity:number; status:string;
  teams:{name:string;submitted:boolean;assigned:boolean;evaluated:boolean}[];
  results:{team:string;rank:number;score:number}[];
}
export default function Workflow() {
  const [data,setData]=useState<Activity>();
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    async function refresh(){
      try {
        const r=await fetch('/api/evaluation/workflow',{cache:'no-store',signal:controller.signal});
        if(r.status===401 || r.status===403){
          setData(undefined);
          setError('Access restricted. Sign in as the CLUSTER4 organizer or accept your assigned judge invitation.');
          return;
        }
        if(!r.ok) throw Error('Event activity is unavailable.');
        setData(await r.json()); setError('');
      } catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Refresh failed.');}
    }
    void refresh();
    const timer=setInterval(()=>{if(!document.hidden)void refresh();},5000);
    window.addEventListener('focus',refresh);
    return ()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  if(!data)return <main className="workflow"><Link href="/">← CampusBEE</Link><p role="status">{error || 'Loading event activity…'}</p>{error && <nav><Link href="/login">Organizer sign-in</Link><Link href="/judge">Judge portal</Link></nav>}</main>;
  const {teams,capacity}=data;
  const counts:[string,number][]=[
    ['Registered',teams.length],['Project submitted',teams.filter(t=>t.submitted).length],
    ['Assigned to judge',teams.filter(t=>t.assigned).length],['Evaluation complete',teams.filter(t=>t.evaluated).length]
  ];
  const when=(value:string)=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  return <main className="workflow">
    <nav><Link href="/">← CampusBEE</Link><Link href="/judge">Open judge desk →</Link></nav>
    <header><small>CLUSTER4 / Live event workflow</small><h1>{data.title}</h1>
      <p>{when(data.start)} – {when(data.end)} IST · {data.venue}</p>
      <strong>{data.registeredCount} of {capacity} teams registered · {Math.max(0,capacity-data.registeredCount)} places left</strong></header>
    {error && <p role="alert">{error} Showing the last update.</p>}
    <section><h2>Group activity</h2><p>Teams reaching each stage · refreshes every five seconds</p>
      {counts.map(([label,count])=><div className="activity-row" key={label}><span>{label}</span>
        <meter aria-label={label} min={0} max={capacity} value={count}/><b>{count} / {capacity}</b></div>)}</section>
    <section><h2>Judging queue</h2>{teams.map(t=><div className="group-row" key={t.name}><strong>{t.name}</strong>
      <span>{t.evaluated?'Evaluated':t.assigned && t.submitted?'Ready for evaluation':t.submitted?'Awaiting assignment':'Awaiting project'}</span></div>)}</section>
    <section><h2>Run the walkthrough</h2><ol>
      <li><strong>Host.</strong> The CLUSTER4 organizer can open this event in Judging Management to inspect the round, rubric and assignments.</li>
      <li><strong>Register and submit.</strong> Each registered student leads a separate team with an event ticket and project brief. Additional students can register through Events while places remain.</li>
      <li><strong>Evaluate.</strong> Open the private invitation on the judge’s computer. Choose a candidate, review the project, save a draft and submit a final rubric. Watch the completed bar update here.</li>
      <li><strong>Publish.</strong> Once all assigned teams are scored, the organizer can finalize and publish the round.</li></ol>
      {data.status==='published'?<><h3>Published results</h3>{data.results.map(r=><p key={r.team}>{r.rank}. {r.team} · {r.score} points</p>)}</>:<p>Results are {data.status==='finalized'?'finalized and awaiting publication':'private until publication'}.</p>}</section>
  </main>;
}
