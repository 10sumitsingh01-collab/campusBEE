'use client';

import BeeLogo from './BeeLogo';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Terminal, ChevronDown, Menu,
  Award,
  Bot,
  Building2,
  Compass,
  Home,
  Layers,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Ticket,
  User,
  Users,
  X,
} from 'lucide-react';
import WorkspaceDialog from './WorkspaceDialog';
import AuthModal from '@/components/AuthModal';
import CampusCalendar from '@/components/CampusCalendar';
import CertificatesView from '@/components/CertificatesView';
import JudgePortal from './JudgePortal';
import JudgingManagement from './JudgingManagement';
import CompetitionsView from '@/components/CompetitionsView';
import StudentCrewSync from './StudentCrewSync';
import CrewSyncView from '@/components/CrewSyncView';
import EventCreateModal from '@/components/EventCreateModal';
import EventPoster from '@/components/EventPoster';
import MyTicketsView from '@/components/MyTicketsView';
import OperationsView from '@/components/OperationsView';
import TeamsRegistrationView from '@/components/TeamsRegistrationView';
import UnstopDiscoveryView from '@/components/UnstopDiscoveryView';
import { createClient, isMockMode } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  canManageEvents,
  MAIN_NAVIGATION,
  ROLE_LABELS,
} from '@/lib/auth/roles';
import {
  detectAudienceClashes,
  detectVenueClashes,
} from '@/lib/coordination/clashCheck';
import {
  AIRecommendation,
  CampusEvent,
  Club,
  ClubActivityMetric,
  Team,
  TeamInvite,
  UserProfile,
  UserRole,
  Venue,
} from '@/types/domain';

const NAV_ICONS: Record<string, React.ReactNode> = {
  calendar: <CalendarDays size={16}/>,
  home: <Home className="h-4 w-4 shrink-0" />,
  events: <Compass className="h-4 w-4 shrink-0" />,
  clubs: <Building2 className="h-4 w-4 shrink-0" />,
  teams: <Users className="h-4 w-4 shrink-0" />,
  tickets: <Ticket className="h-4 w-4 shrink-0" />,
  competitions: <Award className="h-4 w-4 shrink-0" />,
  certificates: <ShieldCheck className="h-4 w-4 shrink-0" />,
  'crew-sync': <Bot className="h-4 w-4 shrink-0" />,
  operations: <Layers className="h-4 w-4 shrink-0" />,
};

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const datePart = start.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const endTime = end.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${datePart} · ${startTime}–${endTime}`;
}

export default function CampusOSApp() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('student');
  const [activeTab, setActiveTab] = useState<string>('home');
  const [loading, setLoading] = useState(true);
  const [dataMode, setDataMode] = useState<'supabase' | 'local_seed'>(
    'local_seed'
  );
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>(
    []
  );
  const [clubMetrics, setClubMetrics] = useState<ClubActivityMetric[]>([]);

  const [judgingEventId,setJudgingEventId]=useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileDepartment, setProfileDepartment] = useState('');
  const [profileYear, setProfileYear] = useState('');
  const [profileRoll, setProfileRoll] = useState('');
  const [profileSkills, setProfileSkills] = useState('');
  const [profileInterests, setProfileInterests] = useState('');
  const [profileSaveMsg, setProfileSaveMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterClub, setFilterClub] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [eventsViewMode, setEventsViewMode] = useState<'grid' | 'calendar'>(
    'grid'
  );

  const [connectionError, setConnectionError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [entryRole, setEntryRole] = useState<UserRole>('student');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'signin'>('signup');
  const [registrationRole,setRegistrationRole] = useState<'volunteer'|'contestant'>('contestant');
  const [pendingEvent, setPendingEvent] = useState<CampusEvent | null>(null);
  const [authRefreshKey, setAuthRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/bootstrap', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          const pubRes = await fetch('/api/public/discover');
          const pubData = pubRes.ok ? await pubRes.json() : null;
          if (active) {
            setConnectionError(false);
            setAuthRequired(true);
            setDataMode(isMockMode() ? 'local_seed' : 'supabase');
            if (pubData) {
              setClubs(pubData.clubs ?? []);
              setVenues(pubData.venues ?? []);
              setEvents(pubData.events ?? []);
            }
            setLoading(false);
          }
          return null;
        }
        if (!res.ok) throw new Error('Unable to load workspace');
        return res.json();
      })
      .then((data) => {
        if (!active || !data) return;
        setConnectionError(false);
        setAuthRequired(false);
        setDataMode(data.dataMode ?? 'local_seed');
        setCurrentUser(data.user ?? null);
        if (data.user?.role) {
          setRole(data.user.role);
        }
        setClubs(data.clubs ?? []);
        setVenues(data.venues ?? []);
        setEvents(data.events ?? []);
        setTeams(data.teams ?? []);
        setInvites(data.invites ?? []);
        setRecommendations(data.recommendations ?? []);
        setClubMetrics(data.clubMetrics ?? []);
        const registrationId = window.sessionStorage.getItem('campusos_registration_event');
        if (registrationId && data.user?.role === 'student') {
          const event = (data.events as CampusEvent[]).find(e => e.id === registrationId);
          if (event) {
            setPendingEvent(event);
            setActiveTab('teams');
          }
        }
        window.sessionStorage.removeItem('campusos_registration_event');
        setLoading(false);
      })
      .catch(() => {
        if (active) { setConnectionError(true); setLoading(false); }
      });

    return () => {
      active = false;
    };
  }, [authRefreshKey]);

  useEffect(() => {
    const refresh = () => setAuthRefreshKey(key => key + 1);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 15000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);

  const visibleNav = useMemo(
    () => MAIN_NAVIGATION.filter((item) => item.roles.includes(role)),
    [role]
  );

  const effectiveTab = visibleNav.some((n) => n.section === activeTab)
    ? activeTab
    : 'home';

  const homeSection: Record<UserRole, string> = {
    student: 'events',
    club_organizer: 'crew-sync',
    judge: 'competitions',
    college_admin: 'operations',
  };
  const displayedSection = effectiveTab === 'home' ? homeSection[role] : effectiveTab;

  const sectionLinks = visibleNav.filter(item => item.section !== 'home')
    .sort((a, b) => Number(b.section === homeSection[role]) - Number(a.section === homeSection[role]))
    .map(item => {
    const labels: Record<string, string> = {
      events: 'Events', clubs: 'Clubs', teams: 'Registrations', tickets: 'Tickets',
      competitions: role === 'judge' ? 'Judging desk' : role === 'student' ? 'Projects & results' : 'Submissions',
      operations: role === 'college_admin' ? 'Campus operations' : 'Event check-in',
    };
    return { section: item.section, label: labels[item.section] ?? item.label };
  });

  const clashes = useMemo(() => detectVenueClashes(events, venues), [events, venues]);
  const managedClubIds = useMemo(() => role === 'club_organizer'
    ? new Set([...clubs.filter(c => c.ownerId === currentUser?.id).map(c => c.id), ...(currentUser?.managedClubIds ?? [])])
    : undefined, [role, clubs, currentUser]);
  const scheduleClashes = useMemo(() => {
    if (!managedClubIds) return clashes;
    const actionable = detectVenueClashes(events, venues, managedClubIds);
    return [...actionable, ...clashes.filter(c => !managedClubIds.has(c.eventA.clubId) && !managedClubIds.has(c.eventB.clubId))];
  }, [events, venues, managedClubIds, clashes]);
  const audienceClashes = useMemo(() => detectAudienceClashes(events), [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (!canManageEvents(role) && ev.status === 'draft') return false;
      if (filterType !== 'all' && ev.eventType !== filterType) return false;
      if (filterClub !== 'all' && ev.clubId !== filterClub) return false;
      if (filterStatus !== 'all' && ev.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          ev.title.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q) ||
          ev.tags.some((t) => t.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [events, filterClub, filterStatus, filterType, role, searchQuery]);

  const handleAddEvent = async (newEvent: CampusEvent) => {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({ ...newEvent, reserveVenue: true }),
    });
    const data = await res.json();
    if (res.ok && data.event) {
      setEvents((prev) => [...prev, data.event]);
      setJudgingEventId(data.event.id);
      if (data.event.status === 'pending_approval') setApprovalMessage(data.event.title + ' was sent to the college admin for approval.');
    } else {
      if (res.status === 409) setAuthRefreshKey(key => key + 1);
      throw new Error(data.error ?? "Could not save the event.");
    }
  };

  const [approvalMessage,setApprovalMessage] = useState('');
  async function changeEventStatus(event: CampusEvent, status: CampusEvent['status']) {
    try {
      const res = await fetch('/api/events/'+event.id+'?from='+event.status, {
        method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to update the event.');
      setEvents(prev=>prev.map(ev=>ev.id===event.id ? {...ev,...data.event} : ev));
      setApprovalMessage(event.title + (status==='published' ? ' is published.' : status==='draft' ? ' was returned to the club as a draft.' : ' was submitted for approval.'));
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : 'Unable to update the event.');
    }
  }

  const [planMessage, setPlanMessage] = useState('');
  const handleResolveClash = async (eventId: string, newVenueId: string, slot?: {startTime: string; endTime: string}) => {
    try {
      const res = await fetch(`/api/events/${eventId}?resolveClash=1`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId: newVenueId, startTime:slot?.startTime, endTime:slot?.endTime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to change the booking.');
      setEvents(prev => prev.map(event => event.id === eventId ? data.event : event));
      setPlanMessage(data.event.title + ' updated on the campus calendar.');
    } catch (error) {
      setPlanMessage(error instanceof Error ? error.message : 'Check your connection and scan again.');
    } finally {
      setAuthRefreshKey(key => key + 1);
    }
  };

  const handleRecommendationAction = async (
    id: string,
    status: 'accepted' | 'dismissed'
  ) => {
    const res = await fetch(`/api/crew-sync/recommendations/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({ status, expectedPlan: recommendations.find(r => r.id === id)?.scheduleChange }),
    });
    const data = await res.json();
    setPlanMessage(res.ok ? 'Review saved.' : data.error ?? 'Unable to save this review.');
    setAuthRefreshKey(key => key + 1);
    if (res.ok && data.recommendation) {
      setRecommendations((prev) =>
        prev.map((rec) => (rec.id === id ? data.recommendation : rec))
      );
    }
  };

  const handleLogout = async () => {
    if (isMockMode()) {
      const response = await fetch('/api/auth/session', { method: 'DELETE' });
      if (!response.ok) return;
      router.replace('/login');
      return;
    }

    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('campusos_preferred_role');
    }
    setShowProfileModal(false);
    setEditingProfile(false);
    setCurrentUser(null);
    setAuthRequired(true);
    setAuthRefreshKey((k) => k + 1);
  };

  const openProfileModal = () => {
    if (currentUser) {
      setProfileName(currentUser.name);
      setProfileDepartment(currentUser.department);
      setProfileYear(currentUser.year ? String(currentUser.year) : '');
      setProfileRoll(currentUser.rollNumber ?? '');
      setProfileSkills(currentUser.skills.join(', '));
      setProfileInterests(currentUser.interests.join(', '));
    }
    setProfileSaveMsg(null);
    setEditingProfile(false);
    setShowProfileModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveMsg(null);
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({
        name: profileName.trim(),
        department: profileDepartment.trim(),
        year: profileYear ? Number(profileYear) : null,
        rollNumber: profileRoll.trim() || null,
        skills: profileSkills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        interests: profileInterests
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setProfileSaveMsg(data.error ?? 'Failed to update profile.');
      return;
    }
    setCurrentUser(data.user);
    setEditingProfile(false);
    setProfileSaveMsg('Profile updated.');
  };

  const getClubName = (clubId: string) =>
    clubs.find((c) => c.id === clubId)?.name ?? clubId;

  const getVenueName = (venueId: string) =>
    venues.find((v) => v.id === venueId)?.name ?? venueId;

  if (loading && !currentUser) {
    return <main className="p-8 text-sm text-[#486055]" role="status">Loading campus events…</main>;
  }

  if (connectionError && !currentUser && !authRequired) {
    return <main className="connection-state"><BeeLogo/><h1>campusBEE couldn’t connect</h1>
      <p>Check your connection and try loading the campus workspace again.</p>
      <button onClick={() => { setLoading(true); setAuthRefreshKey(k => k + 1); }}>Try again</button>
    </main>;
  }

  if (authRequired) {
    return (
      <>
        <UnstopDiscoveryView
          events={events}
          clubs={clubs}
          venues={venues}
          onSelectEvent={(ev) => {
            setEntryRole('student');
            setPendingEvent(ev);
            setAuthModalMode('signup');
            setAuthModalOpen(true);
          }}
          onOpenLogin={() => {
            setEntryRole('student');
            setPendingEvent(null);
            setAuthModalMode('signin');
            setAuthModalOpen(true);
          }}
          onOpenSignup={() => {
            setEntryRole('club_organizer');
            setPendingEvent(null);
            setAuthModalMode('signup');
            setAuthModalOpen(true);
          }}
        />
        {authModalOpen && (
          <AuthModal
            initialRole={entryRole}
            initialMode={authModalMode}
            selectedEvent={pendingEvent}
            onClose={() => setAuthModalOpen(false)}
            onAuthenticated={(chosenRole) => {
              setAuthModalOpen(false);
              setRole(chosenRole);
              if (pendingEvent) {
                setActiveTab(chosenRole === 'student' ? 'teams' : 'events');
              }
              setAuthRefreshKey((k) => k + 1);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="workspace" data-role={role}>
      <a className="skip-content" href="#workspace-main">Skip to workspace</a>
      <header className="workspace-header">
        <div className="workspace-identity">
          <button className="workspace-brand" onClick={() => setActiveTab('home')} aria-label="campusBEE home">
            <BeeLogo/>campusBEE
          </button>
          <span className="workspace-role">{ROLE_LABELS[role]}</span>
          <div className="workspace-account">
            {currentUser && <button className="account-profile" onClick={openProfileModal} aria-label={'Open profile for ' + currentUser.name}>
              <User size={17}/><span>{currentUser.name}</span>
            </button>}
            <button onClick={() => void handleLogout()} aria-label="Log out" title="Log out"><LogOut size={18}/></button>
          </div>
        </div>
        <nav aria-label="Workspace sections" className="workspace-nav">
          {sectionLinks.filter(link=>role!=='student' || !['teams','tickets','competitions','certificates'].includes(link.section)).map(link => <button type="button" key={link.section} className={link.section==='crew-sync'?'workspace-ai-pill':undefined} aria-current={displayedSection === link.section ? 'page' : undefined}
            onClick={() => setActiveTab(link.section)}>
            {link.section==='crew-sync'?<Terminal size={16}/>:NAV_ICONS[link.section]} {link.label}
            {link.section === 'crew-sync' && canManageEvents(role) && scheduleClashes.length > 0 && <span className="nav-count" aria-label={scheduleClashes.length + ' conflicts'}>{scheduleClashes.length}</span>}
          </button>)}
          {role==='student' && (['activity','mobile'] as const).map(kind=><details key={kind} className={'discovery-nav-menu '+kind}
            onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false;}}
            onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
            <summary>{kind==='mobile'?<><Menu size={17}/> Menu</>:<>My Activity <ChevronDown size={15}/></>}</summary>
            <div>{sectionLinks.filter(link=>kind==='mobile'||['teams','tickets','competitions','certificates'].includes(link.section)).map(link=>
              <button key={link.section} aria-current={displayedSection===link.section?'page':undefined}
                onClick={e=>{const menu=e.currentTarget.closest('details');if(menu){menu.open=false;menu.querySelector('summary')?.focus();}setActiveTab(link.section);}}>
                {link.section==='crew-sync'?<Terminal size={16}/>:NAV_ICONS[link.section]}{link.label}</button>)}</div>
          </details>)}
          <label className="mobile-sections">Workspace
            <select aria-label="Workspace section" value={displayedSection} onChange={e => setActiveTab(e.target.value)}>
              {sectionLinks.map(link => <option value={link.section} key={link.section}>{link.label}</option>)}
            </select>
          </label>
        </nav>
      </header>
      <div className="workspace-body">
        <main id="workspace-main" tabIndex={-1} data-section={displayedSection}>
          {approvalMessage && <p role="status" className="px-6 py-3">{approvalMessage} {judgingEventId && role==='club_organizer' && displayedSection!=='judging' && <button className="underline" onClick={()=>setActiveTab('judging')}>Set up judging</button>}</p>}
          {loading ? (
            <div className="p-16 text-center text-sm text-[#717171]">
              Loading campusBEE workspace...
            </div>
          ) : (
            <>
              {displayedSection === 'events' && role === 'student' && eventsViewMode === 'grid' ? (
                <UnstopDiscoveryView events={events} clubs={clubs} venues={venues}
                  onVolunteer={event => {setRegistrationRole('volunteer'); setPendingEvent(event); setActiveTab('teams');}}
                  onSelectEvent={event => { setRegistrationRole('contestant'); setPendingEvent(event); setActiveTab('teams'); }}
                  onOpenLogin={() => void handleLogout()}
                  onOpenCalendar={() => setActiveTab('calendar')}
                  registeredIds={teams.filter(team => team.members.some(m => m.userId === currentUser?.id)).map(team => team.eventId)}
                  onOpenRegistrations={() => setActiveTab('tickets')}
                />
              ) : displayedSection === 'events' && (
                <section className="work-page py-10 max-w-5xl mx-auto px-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1">
                      <h1 className="text-3xl font-semibold text-[#4D4D4D]">
                        Explore Events
                      </h1>
                      <p className="text-sm text-[#717171]">
                        Search, filter, and switch between card listings and the
                        shared campus calendar
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="inline-flex rounded border border-gray-200 bg-[#F5F7FA] p-0.5 text-xs">
                        <button
                          onClick={() => setEventsViewMode('grid')}
                          className={`px-3 py-1.5 rounded font-medium cursor-pointer ${
                            eventsViewMode === 'grid'
                              ? 'bg-white text-[#4D4D4D] shadow-xs'
                              : 'text-[#717171]'
                          }`}
                        >
                          Cards
                        </button>
                        <button
                          onClick={() => setEventsViewMode('calendar')}
                          className={`px-3 py-1.5 rounded font-medium cursor-pointer ${
                            eventsViewMode === 'calendar'
                              ? 'bg-white text-[#4D4D4D] shadow-xs'
                              : 'text-[#717171]'
                          }`}
                        >
                          Calendar
                        </button>
                      </div>

                      {canManageEvents(role) && (
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="inline-flex items-center gap-1.5 bg-action hover:bg-action-hover text-white text-xs font-medium px-3.5 py-2 rounded transition cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create Event
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-[#F5F7FA] p-4 rounded-lg border border-gray-100">
                    <div className="relative sm:col-span-1">
                      <Search className="h-4 w-4 text-[#717171] absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search events or tags..."
                        className="w-full text-xs bg-white border border-gray-200 rounded pl-9 pr-3 py-2 focus:outline-none focus:border-action"
                      />
                    </div>

                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="text-xs bg-white border border-gray-200 rounded px-3 py-2 text-[#4D4D4D]"
                    >
                      <option value="all">All Event Types</option>
                      <option value="Hackathon">Hackathon</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Competition">Competition</option>
                      <option value="Seminar">Seminar</option>
                      <option value="Design Jam">Design Jam</option>
                    </select>

                    <select
                      value={filterClub}
                      onChange={(e) => setFilterClub(e.target.value)}
                      className="text-xs bg-white border border-gray-200 rounded px-3 py-2 text-[#4D4D4D]"
                    >
                      <option value="all">All Clubs</option>
                      {clubs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="text-xs bg-white border border-gray-200 rounded px-3 py-2 text-[#4D4D4D]"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending_approval">Pending approval</option>
                      <option value="published">Published</option>
                      {canManageEvents(role) && (
                        <option value="draft">Draft</option>
                      )}
                    </select>
                  </div>

                  {eventsViewMode === 'calendar' ? (
                    <CampusCalendar
                      events={filteredEvents}
                      clubs={clubs}
                      venues={venues}
                      venueClashes={clashes}
                      audienceClashes={audienceClashes}
                      canManage={canManageEvents(role)}
                      onResolveClash={handleResolveClash}
                    />
                  ) : filteredEvents.length === 0 ? (
                    <div className="text-center py-12 bg-[#F5F7FA] rounded-lg border border-gray-100 text-sm text-[#717171]">
                      No events match your current filters.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {filteredEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="managed-event bg-white border border-gray-200 rounded-lg p-6 flex flex-col justify-between space-y-4"
                        >
                          <div className="space-y-2.5">
                            <div className="managed-poster"><EventPoster event={ev}/></div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="px-2.5 py-0.5 rounded bg-action-tint text-action font-medium">
                                {getClubName(ev.clubId)}
                              </span>
                              <span className="text-[#717171] capitalize">
                                {ev.status.replace('_',' ')}
                              </span>
                            </div>
                            <h2 className="text-lg font-semibold text-[#4D4D4D]">
                              {ev.title}
                            </h2>
                            <p className="text-sm text-[#717171]">
                              {ev.description}
                            </p>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {ev.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[11px] px-2 py-0.5 rounded bg-[#F5F7FA] text-[#717171]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="pt-4 border-t border-gray-100 text-xs text-[#717171] space-y-1.5">
                            <p>
                              <strong className="text-[#4D4D4D]">When:</strong>{' '}
                              {formatTimeRange(ev.startTime, ev.endTime)}
                            </p>
                            <p>
                              <strong className="text-[#4D4D4D]">Venue:</strong>{' '}
                              {getVenueName(ev.venueId)}
                            </p>
                            <p>
                              <strong className="text-[#4D4D4D]">
                                Team Size:
                              </strong>{' '}
                              {ev.minTeamSize === ev.maxTeamSize
                                ? `${ev.minTeamSize === 1 ? 'Individual' : ev.minTeamSize + ' members'}`
                                : `${ev.minTeamSize}–${ev.maxTeamSize} members`}
                            </p>
                            {canManageEvents(role) && ev.status === 'draft' && (
                              <button
                                onClick={() => void changeEventStatus(ev, role==='college_admin' ? 'published' : 'pending_approval')}
                                className="mt-2 w-full text-xs px-3 py-1.5 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
                              >
                                {role==='college_admin' ? 'Publish event' : 'Submit for approval'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {displayedSection === 'calendar' && <section className="work-page space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h1>Campus calendar</h1><p>Events across college clubs · India Standard Time</p></div>
                {role === 'club_organizer' && <button className="rounded bg-action text-white px-4 py-2" onClick={() => setShowCreateModal(true)}>Plan an event</button>}</div>
                <CampusCalendar events={events} clubs={clubs} venues={venues} venueClashes={clashes} audienceClashes={audienceClashes} canManage={false}/>
              </section>}
              {/* CLUBS TAB */}
              {displayedSection === 'clubs' && (
                <section className="work-page py-10 max-w-5xl mx-auto px-6 space-y-8">
                  <div className="space-y-1">
                    <h1 className="text-3xl font-semibold text-[#4D4D4D]">
                      Campus Clubs
                    </h1>
                    <p className="text-sm text-[#717171]">
                      Registered student organizations, interests, and
                      capabilities
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {clubs.map((club) => (
                      <div
                        key={club.id}
                        className="bg-white border border-gray-200 rounded-lg p-6 space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#717171]">
                            {club.category}
                          </span>
                          <span className="text-action font-medium">
                            {club.memberCount} members
                          </span>
                        </div>
                        <h2 className="text-lg font-semibold text-[#4D4D4D]">
                          {club.name}
                        </h2>
                        <p className="text-sm text-[#717171]">
                          {club.description}
                        </p>
                        <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                          {club.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="text-[11px] px-2 py-0.5 rounded bg-action-tint text-action"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* MY TEAMS & REGISTRATIONS */}
              {displayedSection === 'teams' && currentUser && (
                <TeamsRegistrationView
                  initialEventId={pendingEvent?.id}
                  initialRole={registrationRole} onRegistered={() => setAuthRefreshKey(key => key + 1)}
                  student={currentUser}
                  events={events}
                  teams={teams}
                  invites={invites}
                  onUpdateTeams={setTeams}
                  onUpdateInvites={setInvites}
                  onOpenTickets={() => setActiveTab('tickets')}
                />
              )}

              {/* MY TICKETS (Student Portal Only) */}
              {displayedSection === 'tickets' && role === 'student' && (
                <MyTicketsView role={role} onBrowseEvents={() => { setEventsViewMode('grid'); setActiveTab('events'); }} />
              )}

              {displayedSection === 'judging' && role==='club_organizer' && <JudgingManagement initialEventId={judgingEventId} events={events.filter(e=>managedClubIds?.has(e.clubId))}/>}
              {/* COMPETITIONS, JUDGING & LEADERBOARD */}
              {displayedSection === 'competitions' && (
                <>
                  {role==='judge' && <JudgePortal embedded/>}
                  {(role!=='judge'||events.some(ev=>ev.assignedToJudge)) && <CompetitionsView role={role} events={role==='judge'?events.filter(ev=>ev.assignedToJudge):events} teams={teams}/>}
                  {role==='judge' && !events.some(ev=>ev.assignedToJudge) && <p className="work-page">No projects have been assigned directly to this judge account. For direct assignment, the organiser can select your account under Submissions after a candidate submits their project.</p>}
                </>
              )}

              {/* CERTIFICATES */}
              {displayedSection === 'certificates' && (
                <CertificatesView role={role} events={events} />
              )}

              {/* CREW SYNC AI */}
              {displayedSection === 'crew-sync' && role==='student' && currentUser && <StudentCrewSync student={currentUser} events={events}
                onTickets={()=>setActiveTab('tickets')} onRegister={(event,participation)=>{setPendingEvent(event);setRegistrationRole(participation);setActiveTab('teams');}}/>}
              {displayedSection === 'crew-sync' && canManageEvents(role) && (
                <CrewSyncView key={role} onReviewRequests={()=>setActiveTab('operations')} calendarEvents={events}
                  role={role}
                  events={events.filter(e => !managedClubIds || managedClubIds.has(e.clubId))}
                  clubs={clubs}
                  managedClubId={managedClubIds?.values().next().value}
                  planMessage={planMessage}
                  venues={venues}
                  clashes={scheduleClashes}
                  audienceClashes={audienceClashes}
                  refreshSchedule={() => setAuthRefreshKey(key => key + 1)}
                  recommendations={recommendations.filter(r => !managedClubIds || (r.clubId && managedClubIds.has(r.clubId)))}
                  clubMetrics={clubMetrics}
                  onOpenCalendar={() => setActiveTab('calendar')}
                  onOpenCreateEvent={() => setShowCreateModal(true)}
                  onResolveClash={handleResolveClash}
                  onRecommendationAction={handleRecommendationAction}
                  onRecommendationAdded={(rec) =>
                    setRecommendations((prev) => [rec, ...prev.filter(r => r.id !== rec.id)])
                  }
                />
              )}

              {role==='college_admin' && displayedSection==='operations' && <section className="work-page space-y-3">
                <h2>Event approval requests</h2>
                {events.filter(ev=>ev.status==='pending_approval').length===0 && <p>No requests awaiting review.</p>}
                {events.filter(ev=>ev.status==='pending_approval').map(ev=><article key={ev.id} className="rounded-xl border bg-white p-4 space-y-2">
                  <h3>{ev.title}</h3><p>{getClubName(ev.clubId)} · {formatTimeRange(ev.startTime,ev.endTime)} · {getVenueName(ev.venueId)}</p>
                  <p>{ev.description}</p>
                  <div className="flex gap-3"><button className="px-3 py-2 rounded bg-action text-white" onClick={()=>void changeEventStatus(ev,'published')}>Approve and publish</button>
                  <button className="px-3 py-2 rounded border" onClick={()=>void changeEventStatus(ev,'draft')}>Return to club</button></div>
                </article>)}
              </section>}
              {/* ORGANIZER / ADMIN OPERATIONS */}
              {displayedSection === 'operations' && (
                <OperationsView
                  role={role}
                  events={dataMode === 'local_seed' && managedClubIds ? events.filter(e => managedClubIds.has(e.clubId)) : events}
                  venues={venues}
                  onVenueAdded={(v) => setVenues((prev) => [...prev, v])}
                />
              )}
            </>
          )}
        </main>

        {/* Event Create Modal */}
        {showCreateModal && (
          <EventCreateModal needsApproval={role === 'club_organizer'}
            clubs={role === 'club_organizer' && dataMode === 'local_seed' ? clubs.filter(c => c.ownerId === currentUser?.id || currentUser?.managedClubIds?.includes(c.id)) : clubs}
            venues={venues}
            existingEvents={events}
            defaultClubId={currentUser?.managedClubIds?.[0]}
            onClose={() => setShowCreateModal(false)}
            onSaveEvent={handleAddEvent}
          />
        )}

        {/* Full Profile Modal */}
        {showProfileModal && currentUser && (
          <WorkspaceDialog title="Your profile" variant="profile" onClose={() => setShowProfileModal(false)}>
            <div className="bg-white w-full p-6 space-y-5 relative">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
                aria-label="Close profile modal"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3.5">
                <div className="h-14 w-14 rounded-full bg-[#00A859] flex items-center justify-center text-white shrink-0">
                  <User className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#263238]">
                    {currentUser.name}
                  </h2>
                  <span className="inline-block text-xs px-2.5 py-0.5 rounded-full bg-action-tint text-action font-medium mt-0.5">
                    {ROLE_LABELS[currentUser.role]}
                  </span>
                </div>
              </div>

              {profileSaveMsg && (
                <p className="text-xs px-3 py-2 rounded bg-action-tint text-[#263238] font-medium">
                  {profileSaveMsg}
                </p>
              )}

              {editingProfile ? (
                <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
                  <div>
                    <label htmlFor="workspace-email-read-only" className="block font-medium text-[#4D4D4D] mb-1">
                      Email (read-only)
                    </label>
                    <input id="workspace-email-read-only"
                      type="email"
                      disabled
                      value={currentUser.email}
                      className="w-full bg-gray-100 text-gray-500 border border-gray-200 rounded px-3 py-2 cursor-not-allowed"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="workspace-full-name" className="block font-medium text-[#4D4D4D] mb-1">
                        Full Name
                      </label>
                      <input id="workspace-full-name"
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full border border-gray-200 rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label htmlFor="workspace-department" className="block font-medium text-[#4D4D4D] mb-1">
                        Department
                      </label>
                      <input id="workspace-department"
                        type="text"
                        required
                        value={profileDepartment}
                        onChange={(e) => setProfileDepartment(e.target.value)}
                        className="w-full border border-gray-200 rounded px-3 py-2"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="workspace-year" className="block font-medium text-[#4D4D4D] mb-1">
                        Year
                      </label>
                      <input id="workspace-year"
                        type="number"
                        min={1}
                        max={6}
                        value={profileYear}
                        onChange={(e) => setProfileYear(e.target.value)}
                        placeholder="e.g., 3"
                        className="w-full border border-gray-200 rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label htmlFor="workspace-roll-number" className="block font-medium text-[#4D4D4D] mb-1">
                        Roll Number
                      </label>
                      <input id="workspace-roll-number"
                        type="text"
                        value={profileRoll}
                        onChange={(e) => setProfileRoll(e.target.value)}
                        placeholder="e.g., 2024CS042"
                        className="w-full border border-gray-200 rounded px-3 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="workspace-skills-comma-separated" className="block font-medium text-[#4D4D4D] mb-1">
                      Skills (comma separated)
                    </label>
                    <input id="workspace-skills-comma-separated"
                      type="text"
                      value={profileSkills}
                      onChange={(e) => setProfileSkills(e.target.value)}
                      placeholder="React, Python, UI/UX"
                      className="w-full border border-gray-200 rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="workspace-interests-comma-separated" className="block font-medium text-[#4D4D4D] mb-1">
                      Interests (comma separated)
                    </label>
                    <input id="workspace-interests-comma-separated"
                      type="text"
                      value={profileInterests}
                      onChange={(e) => setProfileInterests(e.target.value)}
                      placeholder="AI, Hackathons, Robotics"
                      className="w-full border border-gray-200 rounded px-3 py-2"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setEditingProfile(false)}
                      className="px-3.5 py-2 rounded border border-gray-200 text-[#4D4D4D] hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="bg-[#F5F7FA] rounded-lg p-4 space-y-2 text-xs text-[#4D4D4D]">
                    <p>
                      <strong>Email:</strong> {currentUser.email}
                    </p>
                    <p>
                      <strong>Department:</strong> {currentUser.department}
                    </p>
                    {currentUser.year && (
                      <p>
                        <strong>Year:</strong> {currentUser.year}
                      </p>
                    )}
                    {currentUser.rollNumber && (
                      <p>
                        <strong>Roll Number:</strong> {currentUser.rollNumber}
                      </p>
                    )}
                    <p>
                      <strong>Skills:</strong>{' '}
                      {currentUser.skills.length > 0
                        ? currentUser.skills.join(', ')
                        : 'Not added yet'}
                    </p>
                    <p>
                      <strong>Interests:</strong>{' '}
                      {currentUser.interests.length > 0
                        ? currentUser.interests.join(', ')
                        : 'Not added yet'}
                    </p>
                    <p>
                      <strong>Backend Mode:</strong>{' '}
                      {dataMode === 'supabase'
                        ? 'Supabase PostgreSQL'
                        : 'Local API Store'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Log Out
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProfile(true)}
                        className="px-4 py-2 rounded bg-action hover:bg-action-hover text-white text-xs font-medium cursor-pointer"
                      >
                        Edit Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowProfileModal(false)}
                        className="px-4 py-2 rounded border border-gray-200 text-xs font-medium text-[#4D4D4D] hover:bg-gray-50 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </WorkspaceDialog>
        )}
      </div>
    </div>
  );
}
