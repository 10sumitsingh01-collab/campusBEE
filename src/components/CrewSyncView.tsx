'use client';

import { campusFetch } from '@/lib/auth/tabClient';
import ClubActivityGraph from './ClubActivityGraph';
import React, { useEffect, useState } from 'react';
import {
  FileText,
  Handshake,
  Plus,
  RefreshCw,
  TrendingDown,
  Users,
} from 'lucide-react';
import { AudienceClashResult, VenueClashResult } from '@/lib/coordination/clashCheck';
import {
  AIRecommendation,
  CampusEvent,
  Club,
  ClubActivityMetric,
  EventReport,
  UserRole,
  Venue,
} from '@/types/domain';

interface VolunteerCandidate {
  volunteerId: string;
  name: string;
  department: string;
  year: number;
  matchedSkills: string[];
  availabilityWindows: string[];
  fitReason: string;
}

interface ClubHealthAssessment {
  clubId: string;
  clubName: string;
  status: 'insufficient_data' | 'declining_activity' | 'healthy';
  message: string;
  revivalSuggestions: string[];
}

interface CrewSyncViewProps {
  managedClubId?: string;
  planMessage: string;
  role: UserRole;
  events: CampusEvent[];
  calendarEvents: CampusEvent[];
  clubs: Club[];
  venues: Venue[];
  clashes: VenueClashResult[];
  audienceClashes: AudienceClashResult[];
  refreshSchedule: () => void;
  recommendations: AIRecommendation[];
  clubMetrics: ClubActivityMetric[];
  onReviewRequests: () => void;
  onOpenCreateEvent: () => void;
  onOpenCalendar: () => void;
  onResolveClash: (eventId: string, newVenueId: string, slot?: { startTime:string; endTime:string }) => Promise<void>;
  onRecommendationAction: (
    id: string,
    status: 'accepted' | 'dismissed'
  ) => Promise<void>;
  onRecommendationAdded: (rec: AIRecommendation) => void;
}

type ServiceHealth = {
  status: 'active' | 'fallback';
  checkedAt: number;
  diagnostics?: {
    reason: 'verified' | 'missing_key' | 'provider_unavailable' | 'demo';
    model?: string;
    keyConfigured?: boolean;
    supabaseConfigured?: boolean;
  };
};

function useServiceHealth(diagnostics: boolean) {
  const [health, setHealth] = useState<ServiceHealth | 'checking' | 'unknown'>('checking');
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    async function check() {
      clearTimeout(timer);
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const response = await campusFetch('/api/crew-sync/service-status' + (diagnostics ? '?diagnostics=1' : ''), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!['active', 'fallback'].includes(data.status) || !Number.isFinite(data.checkedAt)) throw new Error();
        if (!controller.signal.aborted) setHealth(data);
      } catch {
        if (!controller.signal.aborted) setHealth('unknown');
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) timer = setTimeout(check, 60_000);
      }
    }
    void check();
    document.addEventListener('visibilitychange', check);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [diagnostics]);
  return health;
}

export default function CrewSyncView({
  managedClubId,
  planMessage,
  role,
  events, calendarEvents,
  clubs,
  clashes, audienceClashes, refreshSchedule,
  recommendations,
  clubMetrics,
  onReviewRequests, onOpenCreateEvent,
  onOpenCalendar,
  onResolveClash,
  onRecommendationAction,
  onRecommendationAdded,
}: CrewSyncViewProps) {
  const [reportBusy,setReportBusy] = useState(false);
  const [reportError,setReportError] = useState('');
  const [reportSource, setReportSource] = useState('');
  const admin = role === 'college_admin';
  const [tool, setTool] = useState(admin ? 'Campus overview' : 'Schedule');
  const settingsOpen = admin && tool === 'AI settings';
  const health = useServiceHealth(settingsOpen);
  const status = typeof health === 'string' ? health : health.status;
  const diagnostics = typeof health === 'object' ? health.diagnostics : undefined;
  const statusLabel = { active: 'AI Services Active', fallback: 'Campus templates active', checking: 'Checking AI service…', unknown: 'AI status unavailable' }[status];
  const [scanNote, setScanNote] = useState('');
  const [moving, setMoving] = useState(false);
  const [coordLoading, setCoordLoading] = useState(false);
  const [collabLoading, setCollabLoading] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState('Frontend, Hardware, Media');
  const [volunteerCandidates, setVolunteerCandidates] = useState<
    VolunteerCandidate[]
  >([]);
  const [healthAssessments, setHealthAssessments] = useState<
    ClubHealthAssessment[]
  >([]);
  const [reportEventId, setReportEventId] = useState('');
  const [organizerNotes, setOrganizerNotes] = useState('');
  const [generatedReport, setGeneratedReport] = useState<EventReport | null>(
    null
  );

  async function applyMove(eventId: string, venueId: string, slot?: { startTime:string; endTime:string }) {
    setMoving(true);
    try { await onResolveClash(eventId, venueId, slot); } finally { setMoving(false); }
  }

  const selectedEvent = events.find(e => e.id === reportEventId) ?? events[0];
  const reportId = selectedEvent?.id;
  useEffect(() => {
    if (tool !== 'Reports' || !reportId) return;
    const controller = new AbortController();
    campusFetch('/api/crew-sync/reports?eventId='+encodeURIComponent(reportId),{signal:controller.signal,cache:'no-store'})
      .then(async res => {
        if (!res.ok) throw new Error('Could not load the saved draft.');
        const data = await res.json();
        if (!controller.signal.aborted && data.reports[0]) setGeneratedReport(prev=>prev?.eventId===reportId ? prev : data.reports[0]);
      }).catch(() => { if (!controller.signal.aborted) setReportError('Could not load the saved draft. You can retry by opening Reports again.'); });
    return () => controller.abort();
  },[tool,reportId]);

  const getClubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? id;

  const formatTimeRange = (startIso: string, endIso: string) => {
    const start = new Date(startIso);
    const end = new Date(endIso);
    return `${start.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata', day: 'numeric',
      month: 'short',
    })} · ${start.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: false,
    })}–${end.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: false,
    })}`;
  };

  const handleRunCoordination = async () => {
    setCoordLoading(true); setScanNote('');
    try {
      const res = await campusFetch('/api/crew-sync/coordination', {
        method: 'POST',
        headers: { 'x-demo-role': role },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to scan the schedule.');
      refreshSchedule();
      setScanNote('Scan complete. Calendar refresh requested.');
      if (Array.isArray(data.recommendations)) {
        for (const rec of data.recommendations) {
          onRecommendationAdded(rec);
        }
      }
    } catch (error) {
      setScanNote(error instanceof Error ? error.message : 'Scan failed. Try again.');
    } finally {
      setCoordLoading(false);
    }
  };

  const handleRunCollaboration = async () => {
    setCollabLoading(true);
    try {
      const res = await campusFetch('/api/crew-sync/collaborations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': role,
        },
        body: JSON.stringify({
          clubId: selectedEvent?.clubId ?? managedClubId ?? clubs[0]?.id,
          eventId: selectedEvent?.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.recommendation) {
        onRecommendationAdded(data.recommendation);
      }
    } finally {
      setCollabLoading(false);
    }
  };

  const handleMatchVolunteers = async (e: React.FormEvent) => {
    e.preventDefault();
    const requiredSkills = skillsQuery
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await campusFetch('/api/crew-sync/volunteers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({
        eventId: selectedEvent?.id,
        requiredSkills,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setVolunteerCandidates(data.candidates ?? []);
    }
  };

  const handleAssessClubHealth = async () => {
    const res = await campusFetch('/api/crew-sync/club-health', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (res.ok) {
      setHealthAssessments(data.assessments ?? []);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent || reportBusy) return;
    setReportBusy(true);
    setReportError('');
    try {
      const res = await campusFetch('/api/crew-sync/reports', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({eventId:selectedEvent.id,organizerNotes}),
      });
      const data = await res.json();
      if (!res.ok || !data.report) throw new Error(data.error || 'Could not save this report. Please try again.');
      setGeneratedReport(data.report);
      setReportSource(data.usedGemini ? 'Drafted with Gemini' : 'Drafted from the campus template');
    } catch (cause) {
      setReportError(cause instanceof Error ? cause.message : 'Could not save the draft. Try again.');
    } finally { setReportBusy(false); }
  };

  return (
    <div className="crew-workspace">
      <div className="work-page py-10 max-w-5xl mx-auto px-6 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h1 className="text-3xl font-semibold text-[#4D4D4D]">
              Crew Sync AI
            </h1>
              <span className="crew-service-status" data-status={status} role="status">{statusLabel}</span>
            </div>
            <p className="text-sm text-[#717171]">
              {admin ? 'Review hosting requests, campus venue conflicts and event reports.' : 'Plan club events, coordinate volunteers and draft event reports.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2"><button className="rounded border bg-white px-4 py-2" onClick={onOpenCalendar}>View campus calendar</button>
          {!admin && <button
            onClick={onOpenCreateEvent}
            className="inline-flex items-center gap-1.5 bg-action hover:bg-action-hover text-white text-xs font-medium px-4 py-2.5 rounded transition cursor-pointer self-start"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Event
          </button>}</div>
        </div>

        <nav className="tool-nav" aria-label="Crew Sync tools">
          {(admin ? ['Campus overview','Schedule','Reports','AI settings'] : ['Schedule', 'Collaborations', 'Volunteers & clubs', 'Reports']).map(name => <button key={name} aria-pressed={tool === name} onClick={() => setTool(name)}>{name}</button>)}
        </nav>
        {admin && tool==='Campus overview' && <section className="space-y-3"><h2>Campus oversight</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="rounded-xl border bg-white p-5 text-left" onClick={onReviewRequests}><strong className="block text-2xl">{events.filter(e=>e.status==='pending_approval').length}</strong>Hosting requests awaiting review →</button>
            <button className="rounded-xl border bg-white p-5 text-left" onClick={()=>setTool('Schedule')}><strong className="block text-2xl">{clashes.length}</strong>Venue conflicts to review →</button>
          </div>
          <ClubActivityGraph clubs={clubs} events={calendarEvents}/>
        </section>}
        {settingsOpen && <section className="crew-ai-settings" aria-label="AI settings">
          <h2>AI settings</h2>
          {diagnostics && typeof health === 'object' ? <>
            {diagnostics.reason === 'demo'
              ? <p>This demo workspace uses campus templates for drafts and the campus schedule for conflict checks.</p>
              : <>
                <dl>
                  <div><dt>Gemini API key</dt><dd>{diagnostics.keyConfigured ? 'Configured' : 'Missing'}</dd></div>
                  <div><dt>Supabase configuration</dt><dd>{diagnostics.supabaseConfigured ? 'Configured' : 'Missing'}</dd></div>
                  <div><dt>Model</dt><dd>{diagnostics.model}</dd></div>
                </dl>
                <p>{diagnostics.reason === 'verified' ? 'Gemini answered the latest generation check.'
                  : diagnostics.reason === 'missing_key' ? 'Campus templates are available while Gemini is unconfigured.'
                  : 'The latest Gemini generation check failed. Drafts can still use campus templates.'}</p>
                <p>Manage <code>GEMINI_API_KEY</code> in the deployment settings or locally in <code>.env.local</code>. Redeploy or restart the server after changes. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Open Google AI Studio</a></p>
              </>}
            <small>Last checked {new Date(health.checkedAt).toLocaleTimeString()}</small>
          </> : <p>{status === 'unknown' ? 'Unable to load service diagnostics.' : 'Checking service diagnostics…'}</p>}
        </section>}
        {!settingsOpen && tool !== 'Campus overview' && tool !== 'Schedule' && events.length > 0 && (
          <label className="flex items-center gap-3 text-sm font-medium">
            Event
            <select
              aria-label="Event for Crew Sync tools" disabled={reportBusy}
              value={selectedEvent?.id ?? ''}
              onChange={(e) => { setReportEventId(e.target.value); setGeneratedReport(null); setReportError(''); setReportSource(''); }}
              className="text-sm border border-gray-200 rounded px-3 py-2 bg-white"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!settingsOpen && planMessage && <p role="status" className="text-sm">{planMessage}</p>}

        {/* 01 · Clash Detection */}
        <div hidden={tool !== 'Schedule'} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[#4D4D4D]">
                Schedule conflicts
              </h2>
              <p className="text-xs text-[#717171]">
                Evaluates time overlap + setup/teardown buffers across campus
                venues
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleRunCoordination()}
                disabled={coordLoading}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${coordLoading ? 'animate-spin' : ''}`}
                />
                Refresh suggestions
              </button>
              <span
                className={`text-xs px-2.5 py-1 rounded font-medium ${
                  clashes.length > 0
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-action-tint text-action'
                }`}
              >
                {clashes.length > 0
                  ? `${clashes.length} venue conflict${clashes.length === 1 ? '' : 's'}`
                  : 'Venues clear'}
              </span>
            </div>
          </div>

          {scanNote && <p role="status">{scanNote}</p>}
          {clashes.length === 0 ? (
            <p className="text-sm text-action bg-action-tint rounded p-4">
              No overlapping venue bookings detected.
            </p>
          ) : (
            <div className="space-y-3">
              {clashes.map((clash) => (
                <div
                  key={`${clash.eventA.id}-${clash.eventB.id}`}
                  className="rounded-lg bg-rose-50/70 border border-rose-200 p-4 space-y-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-rose-900">
                      {clash.venue.name} conflict: {clash.eventA.title} (
                      {getClubName(clash.eventA.clubId)}) vs{' '}
                      {clash.eventB.title} ({getClubName(clash.eventB.clubId)})
                    </p>
                    <p className="text-xs text-rose-700 mt-1">
                      Overlap:{' '}
                      {formatTimeRange(clash.overlapStart, clash.overlapEnd)}
                    </p>
                  </div>

                  <section className="bg-white rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold">Alternative venues for {clash.eventB.title}</h3>
                    <p className="text-sm">{formatTimeRange(clash.eventB.startTime, clash.eventB.endTime)} IST · {clash.eventB.registrationsCount} registered</p>
                    {!clash.alternateVenues.length && <p>No other available room fits this booking at the same time.</p>}
                    {clash.alternateVenues.map(venue => <div key={venue.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2">
                      <span><strong>{venue.name}</strong> · {venue.building} · {venue.capacity} seats</span>
                      {events.some(e => e.id === clash.eventB.id) && <button disabled={moving} onClick={() => void applyMove(clash.eventB.id, venue.id)}
                        className="rounded bg-action text-white px-3 py-2">Move to {venue.name}</button>}
                    </div>)}
                    {!events.some(e => e.id === clash.eventB.id) && <p className="text-sm">The {getClubName(clash.eventB.clubId)} organiser or a college admin can apply these suggestions.</p>}
                    {clash.alternateTimeSlots.length > 0 && <details><summary>Other times at {clash.venue.name}</summary>
                      {clash.alternateTimeSlots.map(slot => <div className="flex flex-wrap items-center justify-between gap-2 py-1" key={slot.startTime}>{slot.label} IST
                        {events.some(e => e.id === clash.eventB.id) && <button className="rounded border px-3" disabled={moving} onClick={() => void applyMove(clash.eventB.id, clash.venue.id, slot)}>Use this time</button>}
                      </div>)}</details>}
                  </section>
                </div>
              ))}
            </div>
          )}
        </div>

        {tool === 'Schedule' && audienceClashes.length > 0 && <section className="rounded-lg border bg-white p-5"><h2>Audience overlaps</h2>
          {audienceClashes.map(c => <p key={c.eventA.id + c.eventB.id}>{c.eventA.title} and {c.eventB.title} run at overlapping times in different venues. Shared interests: {c.sharedTags.join(', ')}.</p>)}
        </section>}

        {/* 02 · Club Collaboration & Explainable Recommendations */}
        <div hidden={tool !== 'Collaborations'} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#4D4D4D] flex items-center gap-2">
                <Handshake className="h-4 w-4 text-action" />
                Collaboration proposals
              </h2>
              <p className="text-xs text-[#717171]">
                Drafted with source evidence; organizers approve or dismiss
              </p>
            </div>
            <button
              onClick={() => void handleRunCollaboration()}
              disabled={collabLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer self-start"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${collabLoading ? 'animate-spin' : ''}`}
              />
              Suggest Collaboration
            </button>
          </div>

          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg bg-[#F5F7FA] border border-gray-200 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-action">
                    {rec.createdByAgent}
                  </span>
                  <span className="capitalize text-[#717171]">
                    {rec.status.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="font-semibold text-[#4D4D4D]">{rec.title}</h3>
                <p className="text-sm text-[#717171]">{rec.summary}</p>
                <p className="text-xs text-[#4D4D4D] bg-white border border-gray-200 rounded p-3">
                  <strong>Evidence:</strong> {rec.explanation}
                </p>
                {rec.status === 'pending_review' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() =>
                        void onRecommendationAction(rec.id, 'accepted')
                      }
                      className="text-xs px-3 py-1.5 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
                    >
                      {rec.scheduleChange ? rec.suggestedActionLabel : 'Approve'}
                    </button>
                    <button
                      onClick={() =>
                        void onRecommendationAction(rec.id, 'dismissed')
                      }
                      className="text-xs px-3 py-1.5 rounded bg-white border border-gray-300 text-[#4D4D4D] hover:bg-gray-50 font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Volunteer matching & Club Health */}
        <div hidden={tool !== 'Volunteers & clubs'} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white border rounded-lg p-6 space-y-2 md:col-span-2">
            <h2>Registered volunteers{selectedEvent ? ' · '+selectedEvent.title : ''}</h2>
            {selectedEvent?.volunteerRoster?.length ? <ul>{selectedEvent.volunteerRoster.map(v=><li key={v.userId}>{v.name}</li>)}</ul>
              : <p>{selectedEvent ? 'No volunteer sign-ups for this event yet.' : 'Select a hosted event to see its volunteers.'}</p>}
          </section>
          <ClubActivityGraph initialClubId={managedClubId ?? selectedEvent?.clubId} clubs={clubs} events={calendarEvents} />
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
              <Users className="h-4 w-4 text-action" />
              Volunteer matching
            </h2>
            <form onSubmit={handleMatchVolunteers} className="flex gap-2">
              <input
                type="text"
                value={skillsQuery}
                onChange={(e) => setSkillsQuery(e.target.value)}
                placeholder="Skills (e.g., Frontend, Hardware, Media)"
                className="flex-1 text-xs border border-gray-200 rounded px-3 py-2"
              />
              <button
                type="submit"
                className="text-xs px-3.5 py-2 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
              >
                Match
              </button>
            </form>

            {volunteerCandidates.length === 0 ? (
              <p className="text-xs text-[#717171]">
                Enter skills to find matching volunteers who opted in to be contacted.
              </p>
            ) : (
              <div className="space-y-2.5">
                {volunteerCandidates.map((c) => (
                  <div
                    key={c.volunteerId}
                    className="rounded bg-[#F5F7FA] p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[#4D4D4D]">
                        {c.name} ({c.department})
                      </p>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-action-tint text-action">
                        {c.matchedSkills.join(', ')}
                      </span>
                    </div>
                    <p className="text-xs text-[#717171]">{c.fitReason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-action" />
                Club activity
              </h2>
              <button
                onClick={() => void handleAssessClubHealth()}
                className="text-xs px-3 py-1.5 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
              >
                Run Check
              </button>
            </div>

            {healthAssessments.length > 0 ? (
              <div className="space-y-2.5">
                {healthAssessments.map((a) => (
                  <div
                    key={a.clubId}
                    className="rounded bg-[#F5F7FA] p-3 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#4D4D4D] text-sm">
                        {a.clubName}
                      </span>
                      <span className="capitalize text-action font-medium">
                        {a.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[#717171]">{a.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {clubMetrics.map((m) => (
                  <div
                    key={`${m.clubId}-${m.periodLabel}`}
                    className="rounded bg-[#F5F7FA] p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-medium text-[#4D4D4D]">
                        {getClubName(m.clubId)}
                      </p>
                      <p className="text-[#717171]">{m.periodLabel.replace(/ \(Simulated\)$/i, '')}</p>
                    </div>
                    <div className="text-right text-[#4D4D4D]">
                      <p>
                        {m.eventCount} events · {m.registrationsCount} reg
                      </p>
                      <p className="text-[#717171]">
                        {m.attendanceCount} attended
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event reports */}
        <div hidden={tool !== 'Reports'} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[#4D4D4D] flex items-center gap-2">
            <FileText className="h-4 w-4 text-action" />
            Event report
          </h2>
          {selectedEvent?.registrationSummary && <div className="grid grid-cols-3 gap-2" aria-label="Live registration totals">
            {[
              ['Registration capacity',selectedEvent.registrationSummary.capacity ?? 'Unspecified'],
              ['Already registered',selectedEvent.registrationSummary.registered],
              ['Spots left',selectedEvent.registrationSummary.remaining ?? 'Unknown'],
            ].map(([label,value]) => <div className="rounded-lg bg-action-tint p-3" key={label}><strong className="block text-xl">{value}</strong><span>{label}</span></div>)}
          </div>}
          <p className="text-sm">Contestants and volunteers each use one venue seat.</p>
          <form
            onSubmit={handleGenerateReport}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
          >

            <input
              type="text"
              value={organizerNotes}
              onChange={(e) => setOrganizerNotes(e.target.value)}
              placeholder="Organizer notes (optional)"
              className="text-sm border border-gray-200 rounded px-3 py-2"
            />
            <button
              type="submit"
              disabled={!selectedEvent || reportBusy}
              className="disabled:opacity-50 bg-action hover:bg-action-hover text-white text-sm font-medium px-4 py-2 rounded cursor-pointer"
            >
              {reportBusy ? 'Saving draft…' : 'Draft Verified Report'}
            </button>
          </form>

          {reportError && <p role="alert">{reportError}</p>}
          {!selectedEvent && <p>Create an event for your club to draft its report.</p>}
          {generatedReport && generatedReport.eventId===selectedEvent?.id && (
            <div className="rounded bg-[#F5F7FA] border border-gray-200 p-4 space-y-2 text-xs">
              <h3 role="status">Saved draft · {selectedEvent?.title}</h3>
              <div className="flex flex-wrap gap-4 font-semibold text-[#4D4D4D]">
                {generatedReport.verifiedMetricsSnapshot.capacity != null && <span>Capacity: {generatedReport.verifiedMetricsSnapshot.capacity} · Spots left: {generatedReport.verifiedMetricsSnapshot.remaining}</span>}
                <span>
                  Registrations:{' '}
                  {generatedReport.verifiedMetricsSnapshot.registrationsCount}
                </span>
                <span>
                  Attendance:{' '}
                  {generatedReport.verifiedMetricsSnapshot.attendanceCount} (
                  {generatedReport.verifiedMetricsSnapshot.attendanceRate}%)
                </span>
                <span>
                  Submissions:{' '}
                  {generatedReport.verifiedMetricsSnapshot.submissionCount}
                </span>
              </div>
              <p className="text-sm text-[#4D4D4D] leading-relaxed">
                {generatedReport.generatedNarrative}
              </p>
              <p>{reportSource}</p>
            </div>
          )}
          <section aria-label="Campus Coding Sprint registration report" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Campus Coding Sprint</h3>
            </div>
            <p className="text-sm"><strong>72 candidates registered</strong> out of 100 spots.</p>
            <progress aria-label="Campus Coding Sprint registration" value={72} max={100} className="block h-2 w-full accent-amber-600" />
            <p className="text-sm font-semibold">28 spots left</p>
          </section>

        </div>
      </div>
    </div>
  );
}
