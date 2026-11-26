import crypto from 'node:crypto';
import { generateId, type CampusOSStore } from '@/lib/server/store';
import type { CampusEvent, EventTicket, UserProfile, Venue } from '@/types/domain';

export function createOpaquePassCodes() {
  const qrToken = crypto.randomBytes(32).toString('hex');
  const ticketCode = `TKT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  return { qrToken, ticketCode };
}

export function issueCampusTicket(event: CampusEvent, venue: Venue | undefined, user: UserProfile, teamId: string | undefined,
  fields: Partial<Pick<EventTicket, 'phone' | 'college' | 'customFields'>> = {}): EventTicket {
  return {
    id: generateId('reg'),
    eventId: event.id,
    eventTitle: event.title,
    eventStartTime: event.startTime,
    eventEndTime: event.endTime,
    venueName: venue?.name ?? 'Campus Venue',
    venueBuilding: venue?.building ?? 'Campus',
    userId: user.id,
    teamId,
    attendeeName: user.name,
    attendeeEmail: user.email,
    phone: fields.phone ?? '',
    college: fields.college ?? '',
    customFields: fields.customFields ?? {},
    ...createOpaquePassCodes(),
    status: 'registered',
    registeredAt: new Date().toISOString(),
  };
}

export function registrationSummary(store: CampusOSStore, event: CampusEvent) {
  const capacity = store.venues.find(v => v.id === event.venueId)?.capacity ?? null;
  const registered = store.tickets.filter(t => t.eventId === event.id && t.status === 'registered').length;
  return { capacity, registered, remaining: capacity === null ? null : Math.max(0, capacity - registered) };
}
