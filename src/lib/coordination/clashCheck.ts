import { CampusEvent, Venue } from '@/types/domain';

export interface VenueClashResult {
  eventA: CampusEvent;
  eventB: CampusEvent;
  venue: Venue;
  overlapStart: string;
  overlapEnd: string;
  severity: 'hard_venue_conflict';
  alternateVenues: Venue[];
  alternateTimeSlots: { startTime: string; endTime: string; label: string }[];
}

export interface AudienceClashResult {
  eventA: CampusEvent;
  eventB: CampusEvent;
  sharedTags: string[];
  severity: 'audience_overlap';
}

function withBuffers(event: CampusEvent): { startMs: number; endMs: number } {
  const startMs =
    new Date(event.startTime).getTime() - event.setupBufferMinutes * 60_000;
  const endMs =
    new Date(event.endTime).getTime() + event.teardownBufferMinutes * 60_000;
  return { startMs, endMs };
}

function isActiveForConflict(event: CampusEvent): boolean {
  return (
    event.status === 'published' ||
    event.status === 'ongoing' ||
    event.status === 'pending_approval'
  );
}

/**
 * Deterministic venue/time overlap detector including setup and teardown buffers.
 * Draft and cancelled events are excluded from public venue conflicts.
 */
export function detectVenueClashes(
  events: CampusEvent[],
  venues: Venue[],
  managedClubs?: ReadonlySet<string>
): VenueClashResult[] {
  const activeEvents = events.filter(isActiveForConflict);
  const clashes: VenueClashResult[] = [];

  for (let i = 0; i < activeEvents.length; i++) {
    for (let j = i + 1; j < activeEvents.length; j++) {
      let a = activeEvents[i];
      let b = activeEvents[j];
      if (managedClubs && !managedClubs.has(b.clubId)) {
        if (!managedClubs.has(a.clubId)) continue;
        [a, b] = [b, a];
      }

      if (!a.venueId || a.venueId !== b.venueId) continue;

      const rangeA = withBuffers(a);
      const rangeB = withBuffers(b);

      if (rangeA.startMs < rangeB.endMs && rangeB.startMs < rangeA.endMs) {
        const venue = venues.find((v) => v.id === a.venueId);
        if (!venue) continue;

        const overlapStart = new Date(
          Math.max(rangeA.startMs, rangeB.startMs)
        ).toISOString();
        const overlapEnd = new Date(
          Math.min(rangeA.endMs, rangeB.endMs)
        ).toISOString();

        clashes.push({
          eventA: a,
          eventB: b,
          venue,
          overlapStart,
          overlapEnd,
          severity: 'hard_venue_conflict',
          alternateVenues: findAlternateVenues(b, activeEvents, venues),
          alternateTimeSlots: findAlternateTimeSlots(b, activeEvents),
        });
      }
    }
  }

  return clashes;
}

/**
 * Checks if a candidate event (e.g. from the Create Event form) would clash
 * with any existing published/pending event.
 */
export function checkCandidateEventClashes(
  candidate: CampusEvent,
  existingEvents: CampusEvent[],
  venues: Venue[]
): VenueClashResult[] {
  if (!isActiveForConflict(candidate)) return [];
  const active = existingEvents.filter(
    (e) => e.id !== candidate.id && isActiveForConflict(e)
  );
  const results: VenueClashResult[] = [];
  const candRange = withBuffers(candidate);

  for (const other of active) {
    if (other.venueId !== candidate.venueId) continue;
    const otherRange = withBuffers(other);
    if (candRange.startMs < otherRange.endMs && otherRange.startMs < candRange.endMs) {
      const venue = venues.find((v) => v.id === candidate.venueId);
      if (!venue) continue;
      results.push({
        eventA: other,
        eventB: candidate,
        venue,
        overlapStart: new Date(
          Math.max(otherRange.startMs, candRange.startMs)
        ).toISOString(),
        overlapEnd: new Date(
          Math.min(otherRange.endMs, candRange.endMs)
        ).toISOString(),
        severity: 'hard_venue_conflict',
        alternateVenues: findAlternateVenues(candidate, active, venues),
        alternateTimeSlots: findAlternateTimeSlots(candidate, active),
      });
    }
  }

  return results;
}

export function findAlternateVenues(
  targetEvent: CampusEvent,
  allEvents: CampusEvent[],
  venues: Venue[]
): Venue[] {
  const targetRange = withBuffers(targetEvent);

  return venues.filter((venue) => {
    if (venue.id === targetEvent.venueId) return false;
    if (venue.capacity < targetEvent.registrationsCount) return false;

    const hasConflict = allEvents.some((other) => {
      if (other.id === targetEvent.id) return false;
      if (other.venueId !== venue.id) return false;
      if (!isActiveForConflict(other)) return false;

      const otherRange = withBuffers(other);
      return (
        targetRange.startMs < otherRange.endMs &&
        otherRange.startMs < targetRange.endMs
      );
    });

    return !hasConflict;
  });
}

/**
 * Finds conflict-free time slots at the same venue on the same day or next day.
 */
export function findAlternateTimeSlots(
  targetEvent: CampusEvent,
  allEvents: CampusEvent[]
): { startTime: string; endTime: string; label: string }[] {
  const durationMs =
    new Date(targetEvent.endTime).getTime() -
    new Date(targetEvent.startTime).getTime();
  if (durationMs <= 0) return [];

  const campusDate = new Date(targetEvent.startTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const midnightMs = Date.parse(campusDate + 'T00:00:00+05:30');
  const candidates: { startTime: string; endTime: string; label: string }[] = [];

  // Try +1 day same time, and evening slot same day (17:00)
  const dayOffsets = Array.from({length: 15}, (_, i) => i);
  for (const dayOffset of dayOffsets) {
    const startHours = dayOffset === 0 ? [17] : [...new Set([(Date.parse(targetEvent.startTime) - midnightMs) / 3600000, 10, 14])];
    for (const hour of startHours) {
      const candStart = new Date(midnightMs + (dayOffset * 24 + hour) * 3600000);
      const candEnd = new Date(candStart.getTime() + durationMs);

      if (candEnd.getTime() > midnightMs + (dayOffset + 1) * 86400000 || candStart.getTime() === Date.parse(targetEvent.startTime)) continue;
      const candStartBuf =
        candStart.getTime() - targetEvent.setupBufferMinutes * 60_000;
      const candEndBuf =
        candEnd.getTime() + targetEvent.teardownBufferMinutes * 60_000;

      const conflicts = allEvents.some((other) => {
        if (other.id === targetEvent.id) return false;
        if (other.venueId !== targetEvent.venueId) return false;
        if (!isActiveForConflict(other)) return false;
        const otherRange = withBuffers(other);
        return candStartBuf < otherRange.endMs && otherRange.startMs < candEndBuf;
      });

      if (!conflicts && candStartBuf >= Date.now()) {
        const dateLabel = candStart.toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
        });
        const startLabel = candStart.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const endLabel = candEnd.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        candidates.push({
          startTime: candStart.toISOString(),
          endTime: candEnd.toISOString(),
          label: `${dateLabel}, ${startLabel}–${endLabel}`,
        });
        if (candidates.length === 3) return candidates;
      }
    }
  }

  return candidates.slice(0, 3);
}

/**
 * Soft audience overlap signal (different venues, overlapping time & shared tags).
 */
export function detectAudienceClashes(
  events: CampusEvent[]
): AudienceClashResult[] {
  const active = events.filter(isActiveForConflict);
  const overlaps: AudienceClashResult[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.venueId === b.venueId) continue; // already covered by hard venue clash

      const aStart = new Date(a.startTime).getTime();
      const aEnd = new Date(a.endTime).getTime();
      const bStart = new Date(b.startTime).getTime();
      const bEnd = new Date(b.endTime).getTime();

      if (aStart < bEnd && bStart < aEnd) {
        const sharedTags = a.tags.filter((t) =>
          b.tags.some((bt) => bt.toLowerCase() === t.toLowerCase())
        );
        if (sharedTags.length > 0) {
          overlaps.push({
            eventA: a,
            eventB: b,
            sharedTags,
            severity: 'audience_overlap',
          });
        }
      }
    }
  }

  return overlaps;
}
