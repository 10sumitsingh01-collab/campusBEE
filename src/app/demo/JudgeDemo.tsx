'use client';
import {useEffect,useState} from 'react';
import {CalendarDays,ScanLine,Network,ChartColumn,Layers} from 'lucide-react';
import QRCode from 'qrcode';
import Image from 'next/image';
import DemoScanner from './DemoScanner';
import {clubs,events,initialPasses,passKey,recommend,students,venues} from './fixtures';

const sections=['Student Experience','Smart ID Verification','Crew Sync AI','Campus Analytics'];
const icons=[CalendarDays,ScanLine,Network,ChartColumn];
const steps=[
  'Register a demo student and open their QR ticket.',
  'Enter the same student’s barcode and mark attendance for the selected event.',
  'Run venue clash detection and inspect the suggested room and time.',
];
const actions=['Venue clash detection','Collaboration','Volunteer matching','Club revival'];
const time=(iso:string)=>new Date(iso).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'});

function Ticket({token}: {token:string}){
  const [image,setImage]=useState('');
  useEffect(()=>{let active=true;QRCode.toDataURL(token,{width:176,margin:3}).then(url=>{if(active)setImage(url);}).catch(()=>{});return ()=>{active=false;};},[token]);
  return <div className="demo-ticket">{image && <Image unoptimized src={image} width="148" height="148" alt="QR ticket encoding the displayed demo pass"/>}<div><small>Demo admission pass</small><h3>Registration confirmed</h3><code>{token}</code></div></div>;
}
export default function JudgeDemo(){
  const [inside,setInside]=useState(false);
  const [tab,setTab]=useState(0);
  const [guided,setGuided]=useState(false);
  const [eventId,setEventId]=useState(events[0].id);
  const [student,setStudent]=useState(students[0].code);
  const [passes,setPasses]=useState(initialPasses);
  const [checked,setChecked]=useState<string[]>([]);
  const [action,setAction]=useState(actions[0]);
  const [skill,setSkill]=useState('Design');
  const [results,setResults]=useState<string[]|null>(null);
  const selected=events.find(e=>e.id===eventId)!;
  const ticket=passKey(eventId,student);
  const schedule=events.map(e=>({...e,registrationsCount:passes.filter(k=>k.startsWith('CAMPUSOS-DEMO/'+e.id+'/')).length}));
  function enter(tour:boolean){setInside(true);setGuided(tour);setTab(0);}
  return <main className="judge-demo"><header className="demo-bar"><span><Layers/> CampusOS</span><small>Demo Environment</small></header>
    {!inside ? <section className="demo-hero"><div><p>AI-Powered Campus Management Platform</p><h1>CampusOS</h1>
      <p>Experience a campus event from registration to check-in. Then take the organiser’s seat and resolve a venue clash.</p>
      <div className="demo-actions"><button onClick={()=>enter(false)}>Enter Judge Demo</button><button onClick={()=>enter(true)}>Start Guided Demo</button></div>
      <small>No account required. All student records are fictional.</small></div></section> :
    <div className="demo-body"><div className="demo-heading"><div><small>CampusOS / Judge dashboard</small><h1>Explore the campus</h1></div>
      <button onClick={()=>enter(true)}>Start Guided Demo</button></div>
      <nav aria-label="Demo sections">{sections.map((name,i)=>{const Icon=icons[i];return <button key={name} aria-pressed={tab===i} onClick={()=>{setGuided(false);setTab(i);}}><Icon size={20}/>{name}</button>;})}</nav>
      {guided && <aside className="demo-guide"><div><small>Guided demo · Step {tab+1} of 3</small><p>{steps[tab]}</p></div>
        <div className="demo-actions">{tab>0 && <button onClick={()=>setTab(tab-1)}>Back</button>}<button onClick={()=>{if(tab<2)setTab(tab+1);else{setGuided(false);setTab(3);}}}>{tab===2?'Finish tour':'Next step'}</button></div></aside>}
      <section className="demo-panel"><h2>{sections[tab]}</h2>
        {tab<2 && <label>Demo event<select value={eventId} onChange={e=>setEventId(e.target.value)}>{events.map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></label>}
        {tab===0 && <><div className={'demo-event-banner art-'+selected.id}><small>{selected.eventType} · November 28</small><h3>{selected.title}</h3><p>{time(selected.startTime)} – {time(selected.endTime)} IST · {venues[0].name}</p></div>
          <p>Choose a fictional student to register or view their existing ticket.</p>
          <label>Demo student<select value={student} onChange={e=>setStudent(e.target.value)}>{students.map(s=><option key={s.code} value={s.code}>{s.name} · {s.code}</option>)}</select></label>
          {passes.includes(ticket)?<Ticket key={ticket} token={ticket}/>:<button onClick={()=>setPasses(prev=>prev.includes(ticket)?prev:[...prev,ticket])}>Register and generate QR ticket</button>}</>}
        {tab===1 && <DemoScanner key={eventId} lookupAttendance={code=>checked.includes(passKey(eventId,code))?'checked':passes.includes(passKey(eventId,code))?'registered':'absent'}
          onAttend={code=>{const key=passKey(eventId,code);if(passes.includes(key))setChecked(prev=>prev.includes(key)?prev:[...prev,key]);}}/>}
        {tab===2 && <><p>Run a rule-based analysis against this demo campus schedule and club history.</p>
          <label>Workflow<select value={action} onChange={e=>{setAction(e.target.value);setResults(null);}}>{actions.map(a=><option key={a}>{a}</option>)}</select></label>
          {action==='Volunteer matching' && <label>Required skill<select value={skill} onChange={e=>{setSkill(e.target.value);setResults(null);}}>{['Design','Photography','Robotics','Prototyping'].map(s=><option key={s}>{s}</option>)}</select></label>}
          <button onClick={()=>setResults(recommend(action,schedule,skill))}>Generate recommendation</button>
          {results && <div className="demo-result" role="status"><h3>{action} findings</h3>{results.length===0?<p>No matches found.</p>:results.map(r=><details key={r}><summary>{r.split('. ')[0]}</summary><p>{r}</p></details>)}</div>}</>}
        {tab===3 && <><p>Figures reflect the fictional campus and actions taken during this visit. Refreshing starts a fresh demo.</p>
          <div className="demo-cards">{[[events.length,'Events'],[clubs.length,'Clubs'],[passes.length,'Registrations'],[checked.length,'Check-ins']].map(([n,label])=><div className="demo-card" key={label}><strong>{n}</strong>{label}</div>)}</div>
          <h3>Event attendance</h3>{schedule.map(e=><p key={e.id}>{e.title} · {e.registrationsCount} registered · {checked.filter(k=>k.startsWith('CAMPUSOS-DEMO/'+e.id+'/')).length} checked in</p>)}
          <h3>Club activity</h3><table><caption>Events hosted per month</caption><thead><tr>{['Club','Sep','Oct','Nov'].map(m=><th key={m}>{m}</th>)}</tr></thead><tbody>{clubs.map(c=><tr key={c.id}><th>{c.name}</th>{c.history.map((n,i)=><td key={i}>{n}</td>)}</tr>)}</tbody></table></>}
      </section></div>}
  </main>;
}
