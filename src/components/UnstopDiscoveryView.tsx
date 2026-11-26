'use client';

import BeeLogo from './BeeLogo';

import { useEffect, useId, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, GalleryHorizontalEnd, List, Clock3, Code2, Flag, MapPin, Mic, Palette, Search, Terminal, Users, Wrench, X } from 'lucide-react';
import EventPoster from './EventPoster';
import type { CampusEvent, Club, Venue } from '@/types/domain';

interface Props {
  events: CampusEvent[];
  clubs: Club[];
  venues: Venue[];
  onSelectEvent: (event: CampusEvent) => void;
  onVolunteer?: (event: CampusEvent) => void;
  onOpenLogin: () => void;
  onOpenSignup?: () => void;
  onOpenCalendar?: () => void;
  registeredIds?: string[];
  onOpenRegistrations?: () => void;
}

const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const teamSize = (e: CampusEvent) => e.maxTeamSize === 1 ? 'Individual' : (e.minTeamSize === e.maxTeamSize ? e.maxTeamSize : e.minTeamSize + '–' + e.maxTeamSize) + ' members';
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const icons = { Hackathon: Code2, Workshop: Wrench, Competition: Flag, Seminar: Mic, 'Design Jam': Palette };

export default function UnstopDiscoveryView({ events, clubs, venues, onVolunteer, registeredIds = [], onOpenRegistrations, onSelectEvent, onOpenLogin, onOpenSignup, onOpenCalendar }: Props) {
  const [section, setSection] = useState<'events' | 'clubs'>('events');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('All');
  const [clubId, setClubId] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState('startTime');
  const [layout, setLayout] = useState<'posters' | 'agenda'>('posters');
  const [featureId, setFeatureId] = useState('');
  const [selected, setSelected] = useState('');
  const headingId = useId();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  const accepting = (e: CampusEvent) => now > 0 && e.status === 'published' && Date.parse(e.registrationDeadline) >= now;
  const catalog = events.filter(e => e.status === 'published' || e.status === 'ongoing');
  const lineup = catalog.filter(e => Date.parse(e.endTime) >= now)
    .sort((a,b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const featureIndex = Math.max(0, lineup.findIndex(e => e.id === featureId));
  const feature = lineup[featureIndex];
  function stepFeature(step: number) {
    setFeatureId(lineup[(featureIndex + step + lineup.length) % lineup.length].id);
  }
  const details = catalog.find(e => e.id === selected);
  const clubName = (id: string) => clubs.find(c => c.id === id)?.name ?? 'Campus club';
  const venueName = (id: string) => venues.find(v => v.id === id)?.name ?? 'Venue pending';
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const visible = catalog.filter(e => (type === 'All' || type === e.eventType) && (!clubId || e.clubId === clubId) &&
    (!openOnly || accepting(e)) && matches([e.title, e.description, clubName(e.clubId), venueName(e.venueId), ...e.tags].join(' ')))
    .sort((a, b) => sort === 'registrationDeadline' ? Date.parse(a.registrationDeadline) - Date.parse(b.registrationDeadline) : Date.parse(a.startTime) - Date.parse(b.startTime));
  const activeClubs = clubs.filter(c => c.status === 'active' && matches(c.name + ' ' + c.description));
  const count = section === 'events' ? visible.length : activeClubs.length;
  function browse(next: typeof section) {
    setSection(next); setSelected(''); setType('All'); setClubId(''); setQuery(''); setOpenOnly(false); setSort('startTime');
  }
  function focusHeading() {
    requestAnimationFrame(() => document.getElementById(headingId)?.focus());
  }
  function showEvent(id: string) {
    setSelected(id); focusHeading();
  }
  const Content = onOpenCalendar ? 'div' : 'main';
  const registered = details && (details.myEventRole || registeredIds.includes(details.id));

  return <div className="campus-discover">
    {!onOpenCalendar && <a className="skip-content" href={'#' + headingId}>Skip to discovery</a>}
    {!onOpenCalendar && <header className="campus-bar">
      <span className="campus-wordmark"><BeeLogo/>campusBEE</span>
      <nav aria-label="Discovery">{(['events', 'clubs'] as const).map(s =>
        <button key={s} aria-pressed={section === s} onClick={() => browse(s)}>{s === 'events' ? 'Events' : 'Clubs'}</button>)}</nav>
      <button className="campus-login" onClick={onOpenLogin}>Sign in</button>
    </header>}
    <Content className="campus-body">
      {details ? <>
        <button className="campus-back" onClick={() => showEvent('')}>Back to {section}</button>
        <article className="campus-detail">
          <div className="campus-detail-banner"><div className="campus-detail-title"><span>{clubName(details.clubId)} · {details.eventType}</span>
            <h1 id={headingId} tabIndex={-1}>{details.title}</h1><p><MapPin size={16}/>{venueName(details.venueId)}</p></div><EventPoster event={details}/></div>
          <div className="campus-detail-body"><section><h2>About the event</h2><p>{details.description || 'Contact the organising club for event details.'}</p>
            <h2>Who can join</h2><p>{details.eligibilityDepartments.join(', ') || 'All departments'} · {details.eligibilityYears.length ? 'Years ' + details.eligibilityYears.join(', ') : 'All years'}</p>
            <h2>Event timeline</h2><dl>{[
              ['Registration closes', details.registrationDeadline], ['Event starts', details.startTime], ['Event ends', details.endTime],
              ...(details.submissionDeadline ? [['Submission deadline', details.submissionDeadline]] : []),
            ].sort((a,b) => Date.parse(a[1]) - Date.parse(b[1])).map(([label, value]) =>
              <div key={label}><dt>{label}</dt><dd>{dateTime.format(new Date(value))} IST</dd></div>)}</dl>
          </section><aside><h2>Registration</h2><p><Users size={17}/>{teamSize(details)}</p>
            <p><Clock3 size={17}/>Closes {date.format(new Date(details.registrationDeadline))}</p>
            <button className="campus-primary" disabled={!registered && !accepting(details)} onClick={() => registered ? onOpenRegistrations?.() : onSelectEvent(details)}>
              {registered ? 'View my registration' : accepting(details) ? (onVolunteer ? 'Register as contestant' : 'Continue to registration') : 'Registration closed'}
            </button>
            {registered && details.myEventRole && <p>Registered as {details.myEventRole}</p>}
            {!registered && accepting(details) && onVolunteer && <button className="campus-primary" onClick={() => onVolunteer(details)}>Register as volunteer</button>}
            </aside></div>
        </article>
      </> : <>
        <div className="campus-showcase"><section className="campus-cover">
          <div className="campus-cover-text"><h1>{section === 'clubs' ? <>Find your <em>campus club.</em></> : <>What’s on <em>campus.</em></>}</h1>
            <p>{section === 'events' ? 'Hackathons, workshops and competitions from your college clubs.' : 'Explore student societies and the events they host.'}</p>
            <form className="campus-search" role="search" onSubmit={e=>{e.preventDefault();focusHeading();}}><input type="search" aria-label={'Search ' + section} placeholder={section === 'events' ? 'Search hackathons, workshops, or clubs...' : 'Search campus clubs'} value={query} onChange={e => setQuery(e.target.value)}/><button type="submit" aria-label="Show search results"><Search size={20}/></button></form>
          </div>
        </section>
          {feature && section === 'events' ? <div className="feature-stage" aria-label="Featured events">
            <span className="feature-label"><CalendarDays size={18}/>Coming up</span>
            <button type="button" className="feature-sheet" onClick={() => showEvent(feature.id)} aria-label={'Explore ' + feature.title}>
              <EventPoster event={feature}/>
              <span className="feature-date">{date.format(new Date(feature.startTime))}</span>
              <span className="feature-caption" aria-live="polite"><small>{clubName(feature.clubId)}</small><strong>{feature.title}</strong></span>
            </button>
            {lineup.length > 1 && <div className="feature-controls">
              <button aria-label="Previous featured event" onClick={() => stepFeature(-1)}><ChevronLeft size={19}/></button>
              <span>{featureIndex + 1} / {lineup.length}</span>
              <button aria-label="Next featured event" onClick={() => stepFeature(1)}><ChevronRight size={19}/></button>
            </div>}
            <button className="feature-view" onClick={()=>showEvent(feature.id)}>View <span aria-hidden="true">→</span></button>
          </div> : null}
        </div>
        <section aria-label="Browse campus">
          <div className="campus-tools"><div className="catalog-heading"><h2 id={headingId} tabIndex={-1}>{section === 'events' ? 'Explore events' : 'Campus clubs'}</h2>
            <span className="campus-count" role="status">{String(count).padStart(2, '0')} {section==='events'?(count===1?'event':'events'):(count===1?'club':'clubs')}</span></div>
            {section==='events' && <div className="layout-switch" role="group" aria-label="Event display">
              <button aria-pressed={layout==='posters'} onClick={()=>setLayout('posters')}><GalleryHorizontalEnd size={16}/>Posters</button>
              <button aria-pressed={layout==='agenda'} onClick={()=>setLayout('agenda')}><List size={16}/>Agenda</button>
              {onOpenCalendar && <button onClick={onOpenCalendar}><CalendarDays size={16}/>Calendar</button>}
            </div>}</div>
          {section==='events' && <div className="campus-filters"><div className="category-scroll">
            {['All', ...new Set(catalog.map(e=>e.eventType))].map(t=><button key={t} aria-pressed={type===t} onClick={()=>setType(t)}>{t==='All'?'All events':t}</button>)}
            {clubId && <button onClick={()=>setClubId('')}>{clubName(clubId)} <X size={14}/></button>}</div>
            <div className="catalog-options"><label className="registration-switch"><input type="checkbox" checked={openOnly} onChange={e=>setOpenOnly(e.target.checked)}/>Open registration</label>
              <label className="campus-sort">Sort <select aria-label="Sort events" value={sort} onChange={e=>setSort(e.target.value)}>
                <option value="startTime">Soonest event</option><option value="registrationDeadline">Earliest deadline</option></select><ChevronDown size={15}/></label></div>
          </div>}
          <div className={section === 'events' && layout === 'agenda' ? 'campus-agenda' : 'campus-cards'}>{section === 'clubs' ? activeClubs.map(c => <article key={c.id}>
            <span className="campus-category"><Users size={16}/>{c.category}</span><h3>{c.name}</h3><p>{c.description}</p>
            <button onClick={() => { browse('events'); setClubId(c.id); focusHeading(); }}>View club events</button>
          </article>) : visible.map(e => {
            const Icon = icons[e.eventType] ?? CalendarDays;
            if (layout === 'agenda') return <article key={e.id} className="agenda-row">
              <time dateTime={e.startTime}>{date.format(new Date(e.startTime))}<small>{new Date(e.startTime).toLocaleTimeString('en-IN', {hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST</small></time>
              <div><span>{clubName(e.clubId)} · {e.eventType}</span><h3><button onClick={() => showEvent(e.id)}>{e.title}</button></h3><p>{venueName(e.venueId)}</p></div>
            </article>;
            return <article key={e.id} data-kind={e.eventType}><button type="button" className="poster-open" aria-label={'Open poster for ' + e.title} onClick={() => showEvent(e.id)}>
              <EventPoster event={e}/>
            </button><div className="campus-cardtop"><span className="campus-category"><Icon size={16}/>{e.eventType}</span>
              <time dateTime={e.startTime}>{date.format(new Date(e.startTime))}</time></div>
              <small className="club-byline"><span aria-hidden="true">{initials(clubName(e.clubId))}</span>{clubName(e.clubId)}</small><h3>{e.title}</h3>
              <ul><li><MapPin/>{venueName(e.venueId)}</li><li><Users/>{teamSize(e)}</li><li className="card-registration"><Clock3/>{accepting(e) ? 'Register by ' + date.format(new Date(e.registrationDeadline)) : 'Registration closed'}</li></ul>
              <div className="campus-cardfoot"><button aria-label={'View details for ' + e.title} onClick={() => showEvent(e.id)}>View details</button>{(e.myEventRole || registeredIds.includes(e.id)) && <span><Check size={16}/>{e.myEventRole === 'volunteer' ? 'Volunteer' : 'Contestant'}</span>}</div>
            </article>;
          })}</div>
          {!count && <div className="campus-empty"><h3>No matching {section}</h3><button onClick={() => browse(section)}>Reset search and filters</button></div>}
        </section>
        {onOpenSignup && <aside className="campus-ai"><Terminal/><div><h2>Crew Sync AI</h2><p>Plan a club event, find a venue and check for clashes.</p></div><button onClick={onOpenSignup}>Organiser access</button></aside>}
      </>}
    </Content>
  </div>;
}
