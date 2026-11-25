'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { checkCandidateEventClashes } from '@/lib/coordination/clashCheck';
import { CampusEvent, Club, EventStatus, Venue } from '@/types/domain';

interface EventCreateModalProps {
  clubs: Club[];
  venues: Venue[];
  existingEvents: CampusEvent[];
  defaultClubId?: string;
  onClose: () => void;
  onSaveEvent: (event: CampusEvent) => void;
}

export default function EventCreateModal({
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
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '');
  const [date, setDate] = useState('2026-11-28');
  const [startHour, setStartHour] = useState('11:00');
  const [endHour, setEndHour] = useState('14:00');
  const [minTeamSize, setMinTeamSize] = useState(1);
  const [maxTeamSize, setMaxTeamSize] = useState(3);
  const [tagsInput, setTagsInput] = useState('AI, Workshop');
  const [status, setStatus] = useState<EventStatus>('published');

  const candidateEvent = useMemo<CampusEvent>(() => {
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
      registrationDeadline: `${date}T09:00:00+05:30`,
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

  const liveClashes = useMemo(
    () => checkCandidateEventClashes(candidateEvent, existingEvents, venues),
    [candidateEvent, existingEvents, venues]
  );

  const isInvalidTime =
    new Date(candidateEvent.endTime).getTime() <=
    new Date(candidateEvent.startTime).getTime();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isInvalidTime) return;
    onSaveEvent({
      ...candidateEvent,
      id: `evt-custom-${Date.now()}`,
    });
    onClose();
  };

  const applyAlternateSlot = (startIso: string, endIso: string) => {
    const s = new Date(startIso);
    const e = new Date(endIso);
    setDate(s.toISOString().slice(0, 10));
    setStartHour(
      s.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    );
    setEndHour(
      e.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Event Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Intro to Embedded AI"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Hosting Club
              </label>
              <select
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-[#4CAF4F]"
              >
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Event Type
              </label>
              <select
                value={eventType}
                onChange={(e) =>
                  setEventType(e.target.value as CampusEvent['eventType'])
                }
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-[#4CAF4F]"
              >
                <option value="Hackathon">Hackathon</option>
                <option value="Workshop">Workshop</option>
                <option value="Competition">Competition</option>
                <option value="Seminar">Seminar</option>
                <option value="Design Jam">Design Jam</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Venue
              </label>
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-[#4CAF4F]"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (cap {v.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Publish Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EventStatus)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-[#4CAF4F]"
              >
                <option value="published">Published (Public Calendar)</option>
                <option value="draft">Draft (Private, No Clash)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                  Start
                </label>
                <input
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                  End
                </label>
                <input
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
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
                  value={minTeamSize}
                  onChange={(e) => setMinTeamSize(Number(e.target.value))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
                />
                <input
                  type="number"
                  min={minTeamSize}
                  max={10}
                  value={maxTeamSize}
                  onChange={(e) => setMaxTeamSize(Number(e.target.value))}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief event overview and participant goals..."
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
              />
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
                {liveClashes[0].alternateVenues.map((alt) => (
                  <button
                    type="button"
                    key={alt.id}
                    onClick={() => setVenueId(alt.id)}
                    className="text-xs px-2.5 py-1 rounded bg-white border border-rose-300 text-[#4D4D4D] hover:border-[#4CAF4F] hover:text-[#4CAF4F] cursor-pointer"
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
                    className="text-xs px-2.5 py-1 rounded bg-white border border-rose-300 text-[#4D4D4D] hover:border-[#4CAF4F] hover:text-[#4CAF4F] cursor-pointer"
                  >
                    Try {slot.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded bg-[#E8F5E9] p-3 flex items-center gap-2 text-xs text-[#4CAF4F] font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {status === 'draft'
                  ? 'Saved as draft — no public venue booking reserved yet.'
                  : 'Venue & time slot are conflict-free.'}
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
              disabled={!title.trim() || isInvalidTime}
              className="text-sm px-5 py-2 rounded bg-[#4CAF4F] hover:bg-[#43A046] disabled:opacity-50 text-white font-medium cursor-pointer"
            >
              {status === 'draft' ? 'Save Draft' : 'Publish Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
