import { NextRequest, NextResponse } from 'next/server';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EventTicket } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['student']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const [{ data: regs, error }, { data: attendances }] = await Promise.all([
      supabase
        .from('registrations')
        .select('*, events(title, start_time, end_time, venues(name, building))')
        .eq('user_id', user.id)
        .eq('status', 'registered')
        .order('registered_at', { ascending: false }),
      supabase
        .from('event_attendance')
        .select('registration_id, event_id, check_in_time')
        .eq('user_id', user.id),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const attMap = new Map(
      (attendances ?? []).map((a) => [a.registration_id ?? a.event_id, a.check_in_time])
    );

    const tickets: EventTicket[] = (regs ?? []).map((r) => {
      const evObj = Array.isArray(r.events) ? r.events[0] : r.events;
      const venueObj = evObj?.venues
        ? Array.isArray(evObj.venues)
          ? evObj.venues[0]
          : evObj.venues
        : null;

      return {
        id: r.id,
        eventId: r.event_id,
        eventTitle: evObj?.title ?? 'Campus Event',
        eventStartTime: evObj?.start_time ?? r.registered_at,
        eventEndTime: evObj?.end_time ?? r.registered_at,
        venueName: venueObj?.name ?? 'TBD Venue',
        venueBuilding: venueObj?.building ?? 'Campus',
        userId: r.user_id,
        teamId: r.team_id ?? undefined,
        attendeeName: r.attendee_name ?? user.name,
        attendeeEmail: r.attendee_email ?? user.email,
        phone: r.phone ?? '',
        college: r.college ?? '',
        customFields: (r.custom_fields as Record<string, string>) ?? {},
        ticketCode: r.ticket_code ?? `TKT-${r.id.slice(0, 6).toUpperCase()}`,
        qrToken: r.qr_token ?? '',
        status: r.status,
        registeredAt: r.registered_at,
        checkedInAt: attMap.get(r.id) ?? attMap.get(r.event_id),
      };
    });

    return NextResponse.json({ tickets });
  }

  const store = getStore();
  const tickets = store.tickets
    .filter((t) => t.userId === user.id)
    .map((t) => {
      const att = store.attendance.find(
        (a) => a.eventId === t.eventId && a.userId === user.id
      );
      return { ...t, checkedInAt: att?.checkInTime };
    });

  return NextResponse.json({ tickets });
}
