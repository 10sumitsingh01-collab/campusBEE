'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Bot,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Home,
  Layers,
  LogOut,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Ticket,
  User,
  Users,
  X,
} from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import CampusCalendar from '@/components/CampusCalendar';
import CertificatesView from '@/components/CertificatesView';
import CompetitionsView from '@/components/CompetitionsView';
import CrewSyncView from '@/components/CrewSyncView';
import EventCreateModal from '@/components/EventCreateModal';
import MyTicketsView from '@/components/MyTicketsView';
import OperationsView from '@/components/OperationsView';
import TeamsRegistrationView from '@/components/TeamsRegistrationView';
import UnstopDiscoveryView from '@/components/UnstopDiscoveryView';
import { createClient } from '@/lib/supabase/client';
import {
  canAccessCrewSync,
  MAIN_NAVIGATION,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
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

function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 391 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-[380px] h-auto mx-auto"
      aria-hidden="true"
    >
      <ellipse cx="195" cy="292" rx="145" ry="12" fill="#E8EEF3" />
      <rect x="160" y="226" width="44" height="36" rx="2" fill="#CFD8DC" />
      <rect x="132" y="258" width="100" height="8" rx="4" fill="#B0BEC5" />
      <rect x="52" y="42" width="260" height="186" rx="10" fill="#263238" />
      <rect x="62" y="52" width="240" height="156" rx="4" fill="#FFFFFF" />
      <rect x="62" y="52" width="240" height="20" rx="2" fill="#F5F7FA" />
      <circle cx="74" cy="62" r="3" fill="#4CAF4F" />
      <circle cx="84" cy="62" r="3" fill="#CFD8DC" />
      <circle cx="94" cy="62" r="3" fill="#CFD8DC" />
      <rect x="76" y="84" width="96" height="108" rx="6" fill="#F5F7FA" />
      <rect x="86" y="96" width="52" height="6" rx="3" fill="#4CAF4F" />
      <rect x="86" y="110" width="74" height="5" rx="2.5" fill="#CFD8DC" />
      <rect x="86" y="122" width="62" height="5" rx="2.5" fill="#CFD8DC" />
      <rect x="86" y="138" width="76" height="22" rx="4" fill="#E8F5E9" />
      <rect x="94" y="146" width="44" height="6" rx="3" fill="#4CAF4F" />
      <rect x="86" y="168" width="58" height="5" rx="2.5" fill="#CFD8DC" />
      <rect
        x="184"
        y="76"
        width="136"
        height="92"
        rx="8"
        fill="#FFFFFF"
        stroke="#E5E7EB"
        strokeWidth="2"
      />
      <rect x="196" y="90" width="48" height="6" rx="3" fill="#263238" />
      <rect x="196" y="104" width="110" height="20" rx="4" fill="#E8F5E9" />
      <circle cx="208" cy="114" r="4" fill="#4CAF4F" />
      <rect x="218" y="111" width="68" height="6" rx="3" fill="#4CAF4F" />
      <rect x="196" y="134" width="84" height="6" rx="3" fill="#CFD8DC" />
      <rect x="196" y="146" width="64" height="6" rx="3" fill="#CFD8DC" />
      <circle cx="332" cy="126" r="14" fill="#263238" />
      <path
        d="M312 152C312 144.268 318.268 138 326 138H338C345.732 138 352 144.268 352 152V202H312V152Z"
        fill="#4CAF4F"
      />
      <rect x="316" y="202" width="12" height="74" rx="4" fill="#263238" />
      <rect x="336" y="202" width="12" height="74" rx="4" fill="#263238" />
      <rect x="284" y="164" width="38" height="24" rx="3" fill="#43A046" />
    </svg>
  );
}

export default function CampusOSApp() {
  const [role, setRole] = useState<UserRole>('club_organizer');
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

  const [authRequired, setAuthRequired] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'signin'>('signup');
  const [pendingEvent, setPendingEvent] = useState<CampusEvent | null>(null);
  const [authRefreshKey, setAuthRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/bootstrap', {
      headers: { 'x-demo-role': role },
    })
      .then(async (res) => {
        if (res.status === 401) {
          const pubRes = await fetch('/api/public/discover');
          const pubData = pubRes.ok ? await pubRes.json() : null;
          if (active) {
            setAuthRequired(true);
            setDataMode('supabase');
            if (pubData) {
              setClubs(pubData.clubs ?? []);
              setVenues(pubData.venues ?? []);
              setEvents(pubData.events ?? []);
            }
            setLoading(false);
          }
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (!active || !data) return;
        setAuthRequired(false);
        setDataMode(data.dataMode ?? 'local_seed');
        setCurrentUser(data.user ?? null);
        if (data.dataMode === 'supabase' && data.user?.role) {
          setRole(data.user.role);
        }
        setClubs(data.clubs ?? []);
        setVenues(data.venues ?? []);
        setEvents(data.events ?? []);
        setTeams(data.teams ?? []);
        setInvites(data.invites ?? []);
        setRecommendations(data.recommendations ?? []);
        setClubMetrics(data.clubMetrics ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [role, authRefreshKey]);

  const visibleNav = useMemo(
    () => MAIN_NAVIGATION.filter((item) => item.roles.includes(role)),
    [role]
  );

  const effectiveTab = visibleNav.some((n) => n.section === activeTab)
    ? activeTab
    : 'home';

  const clashes = useMemo(() => detectVenueClashes(events, venues), [events, venues]);
  const audienceClashes = useMemo(() => detectAudienceClashes(events), [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (!canAccessCrewSync(role) && ev.status === 'draft') return false;
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
      body: JSON.stringify(newEvent),
    });
    const data = await res.json();
    if (res.ok && data.event) {
      setEvents((prev) => [...prev, data.event]);
    }
  };

  const handlePublishDraft = async (eventId: string) => {
    const res = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({ status: 'published' }),
    });
    const data = await res.json();
    if (res.ok && data.event) {
      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? data.event : ev))
      );
    }
  };

  const handleResolveClash = async (eventId: string, newVenueId: string) => {
    const res = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({ venueId: newVenueId }),
    });
    const data = await res.json();
    if (res.ok && data.event) {
      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? data.event : ev))
      );
      setRecommendations((prev) =>
        prev.map((rec) =>
          rec.type === 'clash_resolution' && rec.eventId === eventId
            ? { ...rec, status: 'accepted' }
            : rec
        )
      );
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
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok && data.recommendation) {
      setRecommendations((prev) =>
        prev.map((rec) => (rec.id === id ? data.recommendation : rec))
      );
    }
  };

  const handleLogout = async () => {
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

  const totalRegistrations = events.reduce(
    (sum, ev) => sum + ev.registrationsCount,
    0
  );

  if (authRequired) {
    return (
      <>
        <UnstopDiscoveryView
          events={events}
          clubs={clubs}
          venues={venues}
          onSelectEvent={(ev) => {
            setPendingEvent(ev);
            setAuthModalMode('signup');
            setAuthModalOpen(true);
          }}
          onOpenLogin={() => {
            setPendingEvent(null);
            setAuthModalMode('signin');
            setAuthModalOpen(true);
          }}
          onOpenSignup={() => {
            setPendingEvent(null);
            setAuthModalMode('signup');
            setAuthModalOpen(true);
          }}
        />
        {authModalOpen && (
          <AuthModal
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
    <div className="min-h-screen bg-white text-[#263238] flex flex-col md:flex-row">
      {/* Left-Side Vertical Taskbar */}
      <aside className="w-full md:w-64 md:h-screen md:sticky md:top-0 bg-white border-b md:border-b-0 md:border-r border-gray-200 flex flex-col justify-between z-30 shrink-0">
        <div className="p-5 space-y-6">
          <button
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <div className="h-7 w-7 rounded-md bg-[#4CAF4F] flex items-center justify-center text-white">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-[#263238]">
              CampusOS
            </span>
          </button>

          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0">
            {visibleNav.map((item) => {
              const active = effectiveTab === item.section;
              const isCrewSync = item.section === 'crew-sync';
              return (
                <button
                  key={item.section}
                  onClick={() => setActiveTab(item.section)}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded text-sm font-medium transition whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#E8F5E9] text-[#4CAF4F]'
                      : 'text-[#4D4D4D] hover:bg-[#F5F7FA] hover:text-[#4CAF4F]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {NAV_ICONS[item.section]}
                    <span>{item.label}</span>
                  </span>
                  {isCrewSync && clashes.length > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                      {clashes.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden md:block p-5 border-t border-gray-100 space-y-3 bg-[#F5F7FA]/60">
          {dataMode === 'local_seed' ? (
            <div>
              <label
                htmlFor="role-select"
                className="block text-[11px] font-medium uppercase tracking-wider text-[#717171] mb-1"
              >
                Active Role (Demo)
              </label>
              <select
                id="role-select"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full text-xs font-medium text-[#4D4D4D] bg-white border border-gray-200 rounded px-2.5 py-2 focus:outline-none focus:border-[#4CAF4F] cursor-pointer"
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#717171]">
                  Account Role
                </p>
                <p className="text-xs font-semibold text-[#263238]">
                  {ROLE_LABELS[role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="text-[11px] font-medium text-[#0073E6] hover:underline cursor-pointer"
              >
                Switch Account
              </button>
            </div>
          )}

          <button
            onClick={() =>
              setActiveTab(canAccessCrewSync(role) ? 'crew-sync' : 'events')
            }
            className="w-full inline-flex items-center justify-center gap-1.5 bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium px-4 py-2.5 rounded transition cursor-pointer"
          >
            <span>
              {canAccessCrewSync(role) ? 'Open Crew Sync' : 'Explore Events'}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <div className="pt-2 border-t border-gray-200/80 flex items-center justify-between gap-2">
            {currentUser ? (
              <button
                type="button"
                onClick={openProfileModal}
                className="flex items-center gap-2.5 min-w-0 text-left hover:bg-white p-1.5 -ml-1.5 rounded-lg transition cursor-pointer flex-1"
                title="View full profile"
              >
                <div className="h-9 w-9 rounded-full bg-[#00A859] flex items-center justify-center text-white shrink-0 shadow-xs">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#263238] truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-[11px] text-[#717171] truncate">
                    {ROLE_LABELS[role]} · Profile
                  </p>
                </div>
              </button>
            ) : (
              <span className="text-xs text-[#717171]">Loading session...</span>
            )}

            <button
              type="button"
              onClick={() => void handleLogout()}
              title="Log out"
              aria-label="Log out"
              className="p-2 rounded-lg text-[#717171] hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1">
          {loading && !currentUser ? (
            <div className="p-16 text-center text-sm text-[#717171]">
              Loading CampusOS workspace...
            </div>
          ) : (
            <>
              {/* HOME VIEW */}
              {effectiveTab === 'home' && currentUser && (
                <>
                  <section className="bg-[#F5F7FA] py-16 md:py-20">
                    <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
                      <div className="md:col-span-7 space-y-5">
                        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#4D4D4D] leading-[1.15]">
                          Coordinate campus events{' '}
                          <span className="block text-[#4CAF4F]">
                            with Crew Sync AI
                          </span>
                        </h1>
                        <p className="text-base text-[#717171] max-w-xl leading-relaxed">
                          Signed in as{' '}
                          <strong className="font-medium text-[#263238]">
                            {currentUser.name}
                          </strong>{' '}
                          ({ROLE_LABELS[role]} · {currentUser.department}).
                          Discover events, form teams, resolve venue clashes,
                          and learn from every event.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <button
                            onClick={() =>
                              setActiveTab(
                                canAccessCrewSync(role) ? 'crew-sync' : 'events'
                              )
                            }
                            className="bg-[#4CAF4F] hover:bg-[#43A046] text-white text-sm font-medium px-6 py-3 rounded transition cursor-pointer"
                          >
                            {canAccessCrewSync(role)
                              ? 'Open Crew Sync AI'
                              : 'Browse Events'}
                          </button>
                          <button
                            onClick={() => setActiveTab('clubs')}
                            className="bg-white hover:bg-gray-50 text-[#4D4D4D] border border-gray-200 text-sm font-medium px-5 py-3 rounded transition cursor-pointer"
                          >
                            View Campus Clubs
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-5">
                        <HeroIllustration />
                      </div>
                    </div>
                  </section>

                  <section className="bg-white py-12 border-b border-gray-100">
                    <div className="max-w-5xl mx-auto px-6 text-center space-y-6">
                      <div className="space-y-1.5">
                        <h2 className="text-2xl font-semibold text-[#4D4D4D]">
                          Campus Clubs & Venues
                        </h2>
                        <p className="text-sm text-[#717171]">
                          Unified calendar and shared infrastructure across
                          active student organizations
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 pt-2 text-sm font-medium text-[#717171]">
                        {clubs.map((club) => (
                          <span
                            key={club.id}
                            className="flex items-center gap-2 text-[#4D4D4D]"
                          >
                            <Building2 className="h-4 w-4 text-[#4CAF4F]" />
                            {club.name}
                          </span>
                        ))}
                        {venues.slice(0, 2).map((venue) => (
                          <span
                            key={venue.id}
                            className="flex items-center gap-2 text-[#717171]"
                          >
                            <MapPin className="h-4 w-4 text-[#89939E]" />
                            {venue.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="bg-white py-16">
                    <div className="max-w-5xl mx-auto px-6 space-y-10">
                      <div className="text-center max-w-lg mx-auto space-y-2">
                        <h2 className="text-2xl md:text-3xl font-semibold text-[#4D4D4D]">
                          Manage your entire campus in a single system
                        </h2>
                        <p className="text-sm text-[#717171]">
                          Role-based workflows built for students, clubs, and
                          admins
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white border border-gray-100 rounded-lg p-7 text-center space-y-3 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
                          <div className="mx-auto h-12 w-12 rounded-lg bg-[#E8F5E9] flex items-center justify-center text-[#4CAF4F]">
                            <Users className="h-6 w-6" />
                          </div>
                          <h3 className="text-lg font-semibold text-[#4D4D4D]">
                            Student Discovery & Teams
                          </h3>
                          <p className="text-sm text-[#717171] leading-relaxed">
                            Browse events, register solo or form teams with
                            invite links, submit projects, and earn QR
                            certificates.
                          </p>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-lg p-7 text-center space-y-3 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
                          <div className="mx-auto h-12 w-12 rounded-lg bg-[#E8F5E9] flex items-center justify-center text-[#4CAF4F]">
                            <Calendar className="h-6 w-6" />
                          </div>
                          <h3 className="text-lg font-semibold text-[#4D4D4D]">
                            Crew Sync Coordination
                          </h3>
                          <p className="text-sm text-[#717171] leading-relaxed">
                            Deterministic venue clash checks, cross-club
                            collaborations, volunteer matching, and club health
                            signals.
                          </p>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-lg p-7 text-center space-y-3 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
                          <div className="mx-auto h-12 w-12 rounded-lg bg-[#E8F5E9] flex items-center justify-center text-[#4CAF4F]">
                            <ClipboardCheck className="h-6 w-6" />
                          </div>
                          <h3 className="text-lg font-semibold text-[#4D4D4D]">
                            Judging & Verified Reports
                          </h3>
                          <p className="text-sm text-[#717171] leading-relaxed">
                            Rubric-based evaluation, locked scoring, QR
                            attendance check-in, and data-grounded post-event
                            reports.
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-[#F5F7FA] py-14">
                    <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                      <div className="md:col-span-5 space-y-2">
                        <h2 className="text-2xl md:text-3xl font-semibold text-[#4D4D4D]">
                          Helping campus clubs{' '}
                          <span className="block text-[#4CAF4F]">
                            coordinate & grow
                          </span>
                        </h2>
                        <p className="text-sm text-[#717171]">
                          Live snapshot from the shared campus API
                        </p>
                      </div>

                      <div className="md:col-span-7 grid grid-cols-2 gap-6">
                        <div className="flex items-center gap-3.5">
                          <Users className="h-7 w-7 text-[#4CAF4F] shrink-0" />
                          <div>
                            <p className="text-2xl font-bold text-[#4D4D4D]">
                              {totalRegistrations}
                            </p>
                            <p className="text-xs text-[#717171]">
                              Registrations
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3.5">
                          <Building2 className="h-7 w-7 text-[#4CAF4F] shrink-0" />
                          <div>
                            <p className="text-2xl font-bold text-[#4D4D4D]">
                              {clubs.length}
                            </p>
                            <p className="text-xs text-[#717171]">
                              Active Clubs
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3.5">
                          <Calendar className="h-7 w-7 text-[#4CAF4F] shrink-0" />
                          <div>
                            <p className="text-2xl font-bold text-[#4D4D4D]">
                              {events.length}
                            </p>
                            <p className="text-xs text-[#717171]">
                              Published Events
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3.5">
                          <AlertCircle
                            className={`h-7 w-7 shrink-0 ${
                              clashes.length > 0
                                ? 'text-rose-500'
                                : 'text-[#4CAF4F]'
                            }`}
                          />
                          <div>
                            <p className="text-2xl font-bold text-[#4D4D4D]">
                              {clashes.length}
                            </p>
                            <p className="text-xs text-[#717171]">
                              {clashes.length > 0
                                ? 'Venue Clash Flagged'
                                : 'Conflicts Remaining'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-white py-16">
                    <div className="max-w-5xl mx-auto px-6 space-y-10">
                      <div className="text-center max-w-xl mx-auto space-y-2">
                        <h2 className="text-2xl md:text-3xl font-semibold text-[#4D4D4D]">
                          Upcoming Campus Events
                        </h2>
                        <p className="text-sm text-[#717171]">
                          Discover hackathons, workshops, and design jams across
                          campus
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {events.slice(0, 3).map((ev) => (
                          <article
                            key={ev.id}
                            className="bg-[#F5F7FA] rounded-lg p-6 flex flex-col justify-between space-y-4 border border-gray-100"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-[#4CAF4F]">
                                  {getClubName(ev.clubId)}
                                </span>
                                <span className="text-[#717171]">
                                  {ev.eventType}
                                </span>
                              </div>
                              <h3 className="text-lg font-semibold text-[#4D4D4D]">
                                {ev.title}
                              </h3>
                              <p className="text-sm text-[#717171] leading-relaxed">
                                {ev.description}
                              </p>
                            </div>

                            <div className="pt-3 border-t border-gray-200/80 space-y-1.5 text-xs text-[#717171]">
                              <p>{formatTimeRange(ev.startTime, ev.endTime)}</p>
                              <div className="flex items-center justify-between pt-1">
                                <span className="font-medium text-[#4D4D4D]">
                                  {getVenueName(ev.venueId)}
                                </span>
                                <button
                                  onClick={() => setActiveTab('events')}
                                  className="inline-flex items-center gap-1 text-[#4CAF4F] font-semibold hover:underline cursor-pointer"
                                >
                                  Details <ArrowRight className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="bg-[#F5F7FA] py-14">
                    <div className="max-w-5xl mx-auto px-6 space-y-6">
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold text-[#4D4D4D]">
                          Active Role Boundaries · {ROLE_LABELS[role]}
                        </h2>
                        <p className="text-sm text-[#717171]">
                          Permissions enforced by API route guards and Supabase
                          Row Level Security
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-lg border border-gray-100 p-6 space-y-3">
                          <h3 className="text-sm font-semibold text-[#4CAF4F] flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Allowed Actions
                          </h3>
                          <ul className="space-y-2 text-sm text-[#717171]">
                            {ROLE_PERMISSIONS[role].canDo.map((item) => (
                              <li key={item} className="flex items-start gap-2">
                                <Check className="h-4 w-4 text-[#4CAF4F] shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-100 p-6 space-y-3">
                          <h3 className="text-sm font-semibold text-[#4D4D4D] flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-[#717171]" />
                            Restricted by Default
                          </h3>
                          <ul className="space-y-2 text-sm text-[#717171]">
                            {ROLE_PERMISSIONS[role].restrictedByDefault.map(
                              (item) => (
                                <li
                                  key={item}
                                  className="flex items-start gap-2"
                                >
                                  <X className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                                  <span>{item}</span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* EXPLORE EVENTS TAB */}
              {effectiveTab === 'events' && (
                <section className="py-10 max-w-5xl mx-auto px-6 space-y-6">
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

                      {canAccessCrewSync(role) && (
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="inline-flex items-center gap-1.5 bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium px-3.5 py-2 rounded transition cursor-pointer"
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
                        className="w-full text-xs bg-white border border-gray-200 rounded pl-9 pr-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
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
                      <option value="published">Published</option>
                      {canAccessCrewSync(role) && (
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
                      canManage={canAccessCrewSync(role)}
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
                          className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col justify-between space-y-4"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="px-2.5 py-0.5 rounded bg-[#E8F5E9] text-[#4CAF4F] font-medium">
                                {getClubName(ev.clubId)}
                              </span>
                              <span className="text-[#717171] capitalize">
                                {ev.status}
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
                                ? `${ev.minTeamSize} (Solo)`
                                : `${ev.minTeamSize}–${ev.maxTeamSize} members`}
                            </p>
                            {canAccessCrewSync(role) && ev.status === 'draft' && (
                              <button
                                onClick={() => void handlePublishDraft(ev.id)}
                                className="mt-2 w-full text-xs px-3 py-1.5 rounded bg-[#4CAF4F] hover:bg-[#43A046] text-white font-medium cursor-pointer"
                              >
                                Publish Event
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* CLUBS TAB */}
              {effectiveTab === 'clubs' && (
                <section className="py-10 max-w-5xl mx-auto px-6 space-y-8">
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
                          <span className="text-[#4CAF4F] font-medium">
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
                              className="text-[11px] px-2 py-0.5 rounded bg-[#E8F5E9] text-[#4CAF4F]"
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
              {effectiveTab === 'teams' && currentUser && (
                <TeamsRegistrationView
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
              {effectiveTab === 'tickets' && role === 'student' && (
                <MyTicketsView role={role} />
              )}

              {/* COMPETITIONS, JUDGING & LEADERBOARD */}
              {effectiveTab === 'competitions' && (
                <CompetitionsView role={role} events={events} teams={teams} />
              )}

              {/* CERTIFICATES */}
              {effectiveTab === 'certificates' && (
                <CertificatesView role={role} events={events} />
              )}

              {/* CREW SYNC AI */}
              {effectiveTab === 'crew-sync' && canAccessCrewSync(role) && (
                <CrewSyncView
                  role={role}
                  events={events}
                  clubs={clubs}
                  venues={venues}
                  clashes={clashes}
                  recommendations={recommendations}
                  clubMetrics={clubMetrics}
                  onOpenCreateEvent={() => setShowCreateModal(true)}
                  onResolveClash={handleResolveClash}
                  onRecommendationAction={handleRecommendationAction}
                  onRecommendationAdded={(rec) =>
                    setRecommendations((prev) => [rec, ...prev])
                  }
                />
              )}

              {/* ORGANIZER / ADMIN OPERATIONS */}
              {effectiveTab === 'operations' && (
                <OperationsView
                  role={role}
                  events={events}
                  venues={venues}
                  dataMode={dataMode}
                  onVenueAdded={(v) => setVenues((prev) => [...prev, v])}
                />
              )}
            </>
          )}
        </main>

        {/* Event Create Modal */}
        {showCreateModal && (
          <EventCreateModal
            clubs={clubs}
            venues={venues}
            existingEvents={events}
            defaultClubId={currentUser?.managedClubIds?.[0]}
            onClose={() => setShowCreateModal(false)}
            onSaveEvent={(ev) => void handleAddEvent(ev)}
          />
        )}

        {/* Full Profile Modal */}
        {showProfileModal && currentUser && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-5 relative">
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
                  <span className="inline-block text-xs px-2.5 py-0.5 rounded-full bg-[#E8F5E9] text-[#4CAF4F] font-medium mt-0.5">
                    {ROLE_LABELS[currentUser.role]}
                  </span>
                </div>
              </div>

              {profileSaveMsg && (
                <p className="text-xs px-3 py-2 rounded bg-[#E8F5E9] text-[#263238] font-medium">
                  {profileSaveMsg}
                </p>
              )}

              {editingProfile ? (
                <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-medium text-[#4D4D4D] mb-1">
                      Email (read-only)
                    </label>
                    <input
                      type="email"
                      disabled
                      value={currentUser.email}
                      className="w-full bg-gray-100 text-gray-500 border border-gray-200 rounded px-3 py-2 cursor-not-allowed"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-medium text-[#4D4D4D] mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full border border-gray-200 rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#4D4D4D] mb-1">
                        Department
                      </label>
                      <input
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
                      <label className="block font-medium text-[#4D4D4D] mb-1">
                        Year
                      </label>
                      <input
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
                      <label className="block font-medium text-[#4D4D4D] mb-1">
                        Roll Number
                      </label>
                      <input
                        type="text"
                        value={profileRoll}
                        onChange={(e) => setProfileRoll(e.target.value)}
                        placeholder="e.g., 2024CS042"
                        className="w-full border border-gray-200 rounded px-3 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-[#4D4D4D] mb-1">
                      Skills (comma separated)
                    </label>
                    <input
                      type="text"
                      value={profileSkills}
                      onChange={(e) => setProfileSkills(e.target.value)}
                      placeholder="React, Python, UI/UX"
                      className="w-full border border-gray-200 rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#4D4D4D] mb-1">
                      Interests (comma separated)
                    </label>
                    <input
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
                      className="px-4 py-2 rounded bg-[#4CAF4F] hover:bg-[#43A046] text-white font-medium cursor-pointer"
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
                        className="px-4 py-2 rounded bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium cursor-pointer"
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
          </div>
        )}

        {/* Minimal Dark Footer */}
        <footer className="bg-[#263238] text-gray-300 py-12">
          <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white font-bold text-lg">
                <div className="h-6 w-6 rounded bg-[#4CAF4F] flex items-center justify-center">
                  <Layers className="h-3.5 w-3.5 text-white" />
                </div>
                CampusOS
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                College-wide event ecosystem with Crew Sync AI coordination.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-white">Platform</p>
              <ul className="space-y-1.5 text-xs text-gray-400">
                <li>
                  <button
                    onClick={() => setActiveTab('events')}
                    className="hover:text-white cursor-pointer"
                  >
                    Explore Events
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setActiveTab('clubs')}
                    className="hover:text-white cursor-pointer"
                  >
                    Campus Clubs
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-white">Intelligence</p>
              <ul className="space-y-1.5 text-xs text-gray-400">
                <li>Clash Detection</li>
                <li>Volunteer Matching</li>
                <li>Club Health & Reports</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-white">Environment</p>
              <p className="text-xs text-gray-400">
                Backend:{' '}
                <span className="text-[#4CAF4F]">
                  {dataMode === 'supabase' ? 'Supabase' : 'Local API Store'}
                </span>
              </p>
              <p className="text-xs text-gray-400">
                Active Role: {ROLE_LABELS[role]}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
