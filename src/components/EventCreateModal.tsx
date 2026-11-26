'use client';

import { campusFetch } from '@/lib/auth/tabClient';
import WorkspaceDialog from './WorkspaceDialog';

import EventPoster from './EventPoster';
import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { findAlternateVenues, checkCandidateEventClashes } from '@/lib/coordination/clashCheck';
import { CampusEvent, Club, EventStatus, Venue } from '@/types/domain';

interface EventCreateModalProps {
  needsApproval: boolean;
  clubs: Club[];
  venues: Venue[];
  existingEvents: CampusEvent[];
  defaultClubId?: string;
  onClose: () => void;
  onSaveEvent: (event: CampusEvent) => Promise<void>;
}

export default function EventCreateModal({
  needsApproval,
  clubs,
  venues,
  existingEvents,
  defaultClubId,
  onClose,
  onSaveEvent,
}: EventCreateModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clubId, setClubId] = useState(defaultClubId ?? clubs[0]?.id ?? '');
  const [eventType, setEventType] =
    useState<CampusEvent['eventType']>('Workshop');
  const [venueId, setVenueId] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const [startHour, setStartHour] = useState('11:00');
  const [endHour, setEndHour] = useState('14:00');
  const [minTeamSize, setMinTeamSize] = useState(1);
  const [maxTeamSize, setMaxTeamSize] = useState(3);
  const [tagsInput, setTagsInput] = useState('AI, Workshop');
  const [status, setStatus] = useState<EventStatus>(needsApproval ? 'pending_approval' : 'published');

  const [attendance, setAttendance] = useState(30);
  const requestedEvent = useMemo<CampusEvent>(() => {
    const startTime = `${date}T${startHour}:00+05:30`;
    const endTime = `${date}T${endHour}:00+05:30`;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      id: 'evt-candidate-preview',
      clubId,
      title: title.trim() || 'Untitled Event',
      description:
        description.trim() || 'Club-hosted campus event with Crew Sync.',
      eventType,
      tags: tags.length > 0 ? tags : ['Campus'],
      eligibilityDepartments: ['All Departments'],
      eligibilityYears: [1, 2, 3, 4],
      minTeamSize,
      maxTeamSize: Math.max(minTeamSize, maxTeamSize),
      registrationDeadline: startTime,
      startTime,
      endTime,
      setupBufferMinutes: 30,
      teardownBufferMinutes: 30,
      venueId,
      status,
      registrationsCount: 0,
    };
  }, [
    clubId,
    date,
    description,
    endHour,
    eventType,
    maxTeamSize,
    minTeamSize,
    startHour,
    status,
    tagsInput,
    title,
    venueId,
  ]);

  const suitable = venues.filter(v => v.capacity >= attendance).sort((a,b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
  const available = findAlternateVenues({ ...requestedEvent, venueId: '' }, existingEvents, suitable);
  const allocated = venueId ? venues.find(v => v.id === venueId) : available[0] ?? suitable[0];
  const candidateEvent = { ...requestedEvent, venueId: allocated?.id ?? '' };
  const liveClashes = checkCandidateEventClashes(candidateEvent, existingEvents, venues);
  const invalidRoom = status !== 'draft' && (!allocated || allocated.capacity < attendance);
  const isInvalidTime =
    !Number.isFinite(Date.parse(candidateEvent.startTime)) || !Number.isFinite(Date.parse(candidateEvent.endTime)) ||
    new Date(candidateEvent.endTime).getTime() <=
    new Date(candidateEvent.startTime).getTime();

  const [drafting, setDrafting] = useState(false);
  const [blurb, setBlurb] = useState<{ text: string; usedGemini: boolean; facts: string } | null>(null);
  const facts = JSON.stringify({ title: title.trim(), eventType, tags: candidateEvent.tags });
  const currentBlurb = blurb?.facts === facts ? blurb : null;
  async function draftBlurb() {
    setDrafting(true);
    setError('');
    setBlurb(null);
    try {
      const res = await campusFetch('/api/crew-sync/event-blurb', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: facts,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to draft the blurb.');
      setBlurb({ text: data.text, usedGemini: data.usedGemini, facts });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to draft the blurb.');
    } finally {
      setDrafting(false);
    }
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isInvalidTime || invalidRoom || liveClashes.length) return;
    setSaving(true);
    try {
      await onSaveEvent(candidateEvent);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save event.');
    } finally {
      setSaving(false);
    }
  };

  const applyAlternateSlot = (startIso: string, endIso: string) => {
    const s = new Date(startIso);
    const e = new Date(endIso);
    setDate(s.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    setStartHour(
      s.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    );
    setEndHour(
      e.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    );
  };

  return (
    <WorkspaceDialog title="Create campus event" onClose={onClose}>
      <div className="bg-white w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-[#4D4D4D]">
              Create Campus Event
            </h2>
            <p className="text-xs text-[#717171]">
              Live Crew Sync venue & buffer check runs before publishing
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#717171] hover:text-[#263238] p-1 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="event-preview" aria-label="Poster preview"><EventPoster event={candidateEvent}/>
            <div><small>Poster preview · {eventType}</small><strong>{title.trim() || 'Your event title'}</strong></div>
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="create-event-title" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Event Title
              </label>
              <input id="create-event-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Intro to Embedded AI"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
              />
            </div>

            <div>
              <label htmlFor="create-hosting-club" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Hosting Club
              </label>
              <select id="create-hosting-club"
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-action"
              >
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="create-event-type" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Event Type
              </label>
              <select id="create-event-type"
                value={eventType}
                onChange={(e) =>
                  setEventType(e.target.value as CampusEvent['eventType'])
                }
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-action"
              >
                <option value="Hackathon">Hackathon</option>
                <option value="Workshop">Workshop</option>
                <option value="Competition">Competition</option>
                <option value="Seminar">Seminar</option>
                <option value="Design Jam">Design Jam</option>
              </select>
            </div>

            <div>
              <label htmlFor="create-venue" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Venue
              </label>
              <select id="create-venue"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-action"
              >
                <option value="">Auto-assign with Crew Sync</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (cap {v.capacity})
                  </option>
                ))}
              </select>
              <label className="block mt-2 text-sm">Expected attendees<input required type="number" min={1} value={attendance || ''} onChange={e => setAttendance(Number(e.target.value))} className="block w-full border p-2"/></label>
              <p role="status" className="text-sm mt-2">{invalidRoom ? 'No suitable room selected. Check attendance or choose a larger venue.' : allocated ? allocated.name + ' · ' + allocated.capacity + ' seats' : 'No venue available'}</p>
            </div>

            <div>
              <label htmlFor="create-publish-status" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Publish Status
              </label>
              <select id="create-publish-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as EventStatus)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-action"
              >
                <option value={needsApproval ? 'pending_approval' : 'published'}>{needsApproval ? 'Request college admin approval' : 'Publish to campus calendar'}</option>
                <option value="draft">Draft (Private, No Clash)</option>
              </select>
            </div>

            <div>
              <label htmlFor="create-date" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Date
              </label>
              <input id="create-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="create-start" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                  Start
                </label>
                <input id="create-start"
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
                />
              </div>
              <div>
                <label htmlFor="create-end" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                  End
                </label>
                <input id="create-end"
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Team Size (Min – Max)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  max={10}
                  aria-label="Minimum team size"
                  value={minTeamSize}
                  onChange={(e) => setMinTeamSize(Number(e.target.value))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
                />
                <input
                  type="number"
                  min={minTeamSize}
                  max={10}
                  aria-label="Maximum team size"
                  value={maxTeamSize}
                  onChange={(e) => setMaxTeamSize(Number(e.target.value))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
                />
              </div>
            </div>

            <div>
              <label htmlFor="create-tags-comma-separated" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Tags (comma separated)
              </label>
              <input id="create-tags-comma-separated"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="create-description" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Description
              </label>
              <textarea id="create-description"
                aria-label="Event description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief event overview and participant goals..."
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
              />
              <button type="button" className="blurb-button" disabled={!title.trim() || drafting} onClick={draftBlurb}>
                {drafting ? 'Drafting…' : 'Suggest event blurb'}
              </button>
              {currentBlurb && <div className="blurb-draft" role="status"><small>{currentBlurb.usedGemini ? 'Gemini draft' : 'Campus template draft'}</small>
                <p>{currentBlurb.text}</p><button type="button" className="blurb-button" onClick={() => { setDescription(currentBlurb.text); setBlurb(null); }}>Use this description</button>
              </div>}
            </div>
          </div>

          {/* Live Deterministic Clash Feedback */}
          {isInvalidTime ? (
            <div className="rounded bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              End time must be after start time.
            </div>
          ) : liveClashes.length > 0 ? (
            <div className="rounded bg-rose-50 border border-rose-200 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-900">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>
                  Venue clash with {liveClashes[0].eventA.title} (includes 30m
                  setup/teardown buffer)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {liveClashes[0].alternateVenues.filter(v => v.capacity >= attendance).map((alt) => (
                  <button
                    type="button"
                    key={alt.id}
                    onClick={() => setVenueId(alt.id)}
                    className="text-xs px-2.5 py-1 rounded bg-white border border-rose-300 text-[#4D4D4D] hover:border-action hover:text-action cursor-pointer"
                  >
                    Switch to {alt.name}
                  </button>
                ))}
                {liveClashes[0].alternateTimeSlots.map((slot) => (
                  <button
                    type="button"
                    key={slot.label}
                    onClick={() =>
                      applyAlternateSlot(slot.startTime, slot.endTime)
                    }
                    className="text-xs px-2.5 py-1 rounded bg-white border border-rose-300 text-[#4D4D4D] hover:border-action hover:text-action cursor-pointer"
                  >
                    Try {slot.label}
                  </button>
                ))}
              </div>
            </div>
          ) : invalidRoom ? null : (
            <div className="rounded bg-action-tint p-3 flex items-center gap-2 text-xs text-action font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {status === 'draft'
                  ? 'Saved as draft — no public venue booking reserved yet.'
                  : 'No overlapping venue bookings.'}
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded border border-gray-200 text-[#4D4D4D] hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || isInvalidTime || invalidRoom || liveClashes.length > 0}
              className="text-sm px-5 py-2 rounded bg-action hover:bg-action-hover disabled:opacity-50 text-white font-medium cursor-pointer"
            >
              {status === 'draft' ? 'Save Draft' : needsApproval ? 'Submit for approval' : 'Publish Event'}
            </button>
          </div>
        </form>
      </div>
    </WorkspaceDialog>
  );
}
