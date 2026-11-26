import {checkStudentEligibility} from '@/lib/registration/teamRules';
import type {CampusEvent, EventRole, UserProfile} from '@/types/domain';

const starts = (event: CampusEvent) => Date.parse(event.startTime);
const ends = (event: CampusEvent) => Date.parse(event.endTime);
const overlaps = (a: CampusEvent,b: CampusEvent) => starts(a)<ends(b) && starts(b)<ends(a);
const dateFormat = new Intl.DateTimeFormat('en-IN',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'});

export default function StudentCrewSync({student,events,onRegister,onTickets}: {
  student:UserProfile; events:CampusEvent[]; onRegister:(event:CampusEvent,role:EventRole)=>void; onTickets:()=>void;
}) {
  const now = new Date();
  const upcoming = events.filter(e=>['published','ongoing'].includes(e.status) && ends(e)>now.getTime()).sort((a,b)=>starts(a)-starts(b));
  const agenda = upcoming.filter(e=>e.myEventRole);
  const interests = [...new Set([...student.skills,...student.interests].map(s=>s.toLowerCase().trim()).filter(Boolean))];
  const options = upcoming.filter(e=>e.status==='published' && !e.myEventRole && e.registrationSummary?.remaining!==0 && checkStudentEligibility(student,e,now).eligible)
    .map(event=>{
      const text = [event.title,event.eventType,...event.tags].join(' ').toLowerCase();
      return {event,matches:interests.filter(s=>text.includes(s)), clash:agenda.find(e=>overlaps(e,event))};
    }).sort((a,b)=>Number(Boolean(a.clash))-Number(Boolean(b.clash)) || b.matches.length-a.matches.length || starts(a.event)-starts(b.event));
  return <section className="work-page space-y-6">
    <header><h1>Crew Sync AI</h1><p>Your schedule and events that fit your interests and availability.</p></header>
    <section className="space-y-2 rounded-xl border bg-white p-5"><h2>My upcoming events</h2>
      {agenda.length===0 && <p>Your registrations will appear here.</p>}
      {agenda.map(event=><div key={event.id}><strong>{event.title}</strong> · {dateFormat.format(starts(event))} IST · {event.myEventRole}
        {agenda.filter(other=>other.id!==event.id && overlaps(event,other)).map(other=><p key={other.id}>Overlaps with {other.title}</p>)}</div>)}
      {agenda.length>0 && <button onClick={onTickets}>View my tickets</button>}
    </section>
    <section className="space-y-3"><h2>Suggested events</h2>
      {options.length===0 && <p>No more eligible events are open for registration.</p>}
      {options.map(({event,matches,clash})=><article key={event.id} className="space-y-2 rounded-xl border bg-white p-4">
        <h3>{event.title}</h3><p>{dateFormat.format(starts(event))} IST · {event.eventType}</p>
        {matches.length>0 && <p>Matches your profile · {matches.join(', ')}</p>}
        <p>{clash ? 'Overlaps with '+clash.title : 'Fits your schedule'}</p>
        <div className="flex gap-3"><button className="rounded bg-action px-3 py-2 text-white" onClick={()=>onRegister(event,'contestant')}>Join as contestant</button>
        <button className="rounded border px-3 py-2" onClick={()=>onRegister(event,'volunteer')}>Volunteer</button></div>
      </article>)}
    </section>
  </section>;
}
