'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, Calendar, Clock, MapPin, Users } from 'lucide-react';
import {
  AudienceClashResult,
  VenueClashResult,
} from '@/lib/coordination/clashCheck';
import { CampusEvent, Club, Venue } from '@/types/domain';

interface CampusCalendarProps {
  events: CampusEvent[];
  clubs: Club[];
  venues: Venue[];
  venueClashes: VenueClashResult[];
  audienceClashes: AudienceClashResult[];
  canManage: boolean;
  onResolveClash?: (eventId: string, newVenueId: string) => void;
}

export default function CampusCalendar({
  events,
  clubs,
  venues,
  venueClashes,
  audienceClashes,
  canManage,
  onResolveClash,
}: CampusCalendarProps) {
  const getClubName = (id: string) =>
    clubs.find((c) => c.id === id)?.name ?? id;
  const getVenueName = (id: string) =>
    venues.find((v) => v.id === id)?.name ?? id;

  const campusDay = (value: string | Date) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [month, setMonth] = useState(() => campusDay(new Date()).slice(0, 7));
  const [day, setDay] = useState('');
  const first = new Date(month + '-01T12:00:00Z');
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0)).getUTCDate();
  const spans = events.map(event => ({start: campusDay(event.startTime), end: campusDay(new Date(Date.parse(event.endTime)-1))}));
  function moveMonth(offset: number) {
    first.setUTCMonth(first.getUTCMonth() + offset);
    setMonth(first.toISOString().slice(0,7)); setDay('');
  }
  const groupedByDate = useMemo(() => {
    const sorted = events.filter(ev => !day || (campusDay(ev.startTime) <= day && day <= campusDay(new Date(Date.parse(ev.endTime)-1)))).sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    const groups: Record<string, CampusEvent[]> = {};
    for (const ev of sorted) {
      const dateKey = new Date(ev.startTime).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata', weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(ev);
    }
    return Object.entries(groups);
  }, [events, day]);

  const clashingEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of venueClashes) {
      ids.add(c.eventA.id);
      ids.add(c.eventB.id);
    }
    return ids;
  }, [venueClashes]);

  return (
    <div className="space-y-6">
      <section className="month-board"><header><button aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><h2>{first.toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'})}</h2><button aria-label="Next month" onClick={() => moveMonth(1)}>›</button></header>
        <div className="month-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <small key={d}>{d}</small>)}
          {Array.from({length:days},(_,i) => {
            const key = month + '-' + String(i+1).padStart(2,'0');
            const count = spans.filter(s => s.start <= key && key <= s.end).length;
            return <button key={key} aria-label={key + ', ' + count + ' events'} aria-pressed={day===key} onClick={() => setDay(key)}
              style={i===0 ? {gridColumnStart:(first.getUTCDay()+6)%7+1} : undefined}>{i+1}{count>0 && <b>{count}</b>}</button>;
          })}
        </div></section>
      <div className="flex items-center justify-between"><h2>{day || 'All scheduled events'}</h2>{day && <button className="underline" onClick={() => setDay('')}>Show all events</button>}</div>
      {!groupedByDate.length && <p>No events scheduled{day ? ' for this day' : ''}.</p>}
      {/* Soft Audience Overlap Notice (distinct from Hard Venue Conflict) */}
      {audienceClashes.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 space-y-1">
          <p className="text-xs font-semibold text-amber-900">
            Informational: Audience Overlap Signal (Different Venues)
          </p>
          {audienceClashes.map((ac) => (
            <p
              key={`${ac.eventA.id}-${ac.eventB.id}`}
              className="text-xs text-amber-800"
            >
              {ac.eventA.title} and {ac.eventB.title} overlap in time with
              shared tags ({ac.sharedTags.join(', ')}).
            </p>
          ))}
        </div>
      )}

      {/* Chronological Day-by-Day Calendar */}
      <div className="space-y-6">
        {groupedByDate.map(([dateLabel, dayEvents]) => (
          <div
            key={dateLabel}
            className="bg-white border border-gray-200 rounded-lg overflow-hidden"
          >
            <div className="bg-[#F5F7FA] px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#4D4D4D]">
                <Calendar className="h-4 w-4 text-action" />
                <span>{dateLabel}</span>
              </div>
              <span className="text-xs text-[#717171]">
                {dayEvents.length}{' '}
                {dayEvents.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {dayEvents.map((ev) => {
                const hasVenueClash = clashingEventIds.has(ev.id);
                const clashForEvent = venueClashes.find(
                  (c) => c.eventB.id === ev.id
                );
                const startStr = new Date(ev.startTime).toLocaleTimeString(
                  'en-IN',
                  { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }
                );
                const endStr = new Date(ev.endTime).toLocaleTimeString(
                  'en-IN',
                  { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }
                );

                return (
                  <div
                    key={ev.id}
                    className={`p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
                      hasVenueClash ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-action-tint text-action">
                          {getClubName(ev.clubId)}
                        </span>
                        <span className="text-xs text-[#717171] capitalize">
                          {ev.status}
                        </span>
                        {hasVenueClash && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                            <AlertCircle className="h-3 w-3" />
                            Hard Venue Clash
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-semibold text-[#4D4D4D]">
                        {ev.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-[#717171]">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {startStr}–{endStr} (±{ev.setupBufferMinutes}m buffer)
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {getVenueName(ev.venueId)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {ev.registrationsCount} registered
                        </span>
                      </div>
                    </div>

                    {canManage &&
                      clashForEvent &&
                      onResolveClash &&
                      clashForEvent.alternateVenues.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {clashForEvent.alternateVenues.map((alt) => (
                            <button
                              key={alt.id}
                              onClick={() => onResolveClash(ev.id, alt.id)}
                              className="text-xs px-3 py-1.5 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
                            >
                              Move to {alt.name}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
