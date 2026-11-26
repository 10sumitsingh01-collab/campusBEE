import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore, saveDemoStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EventAttendance } from '@/types/domain';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: eventId } = await context.params;

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const [attRes, regCountRes] = await Promise.all([
      supabase
        .from('event_attendance')
        .select('*, registrations(attendee_name, attendee_email, college, ticket_code)')
        .eq('event_id', eventId)
        .order('check_in_time', { ascending: false }),
      supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'registered'),
    ]);

    if (attRes.error) {
      return NextResponse.json({ error: attRes.error.message }, { status: 403 });
    }

    const records = (attRes.data ?? []).map((a) => {
      const regObj = Array.isArray(a.registrations)
        ? a.registrations[0]
        : a.registrations;
      return {
        id: a.id,
        eventId: a.event_id,
        userId: a.user_id,
        checkInTime: a.check_in_time,
        checkInMethod: a.check_in_method,
        attendeeName: regObj?.attendee_name ?? 'Attendee',
        attendeeEmail: regObj?.attendee_email ?? '',
        college: regObj?.college ?? '',
        ticketCode: regObj?.ticket_code ?? '',
      };
    });

    return NextResponse.json({
      eventId,
      count: records.length,
      totalRegistrations: regCountRes.count ?? 0,
      records,
    });
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }
  if (!canManageClub(user, event.clubId)) {
    return forbiddenResponse('Only organizers or admins can view attendance.');
  }

  const records = store.attendance
    .filter((a) => a.eventId === eventId)
    .map((a) => {
      const ticket = store.tickets.find(
        (t) => t.eventId === eventId && t.userId === a.userId
      );
      return {
        ...a,
        attendeeName: ticket?.attendeeName ?? 'Attendee',
        attendeeEmail: ticket?.attendeeEmail ?? '',
        college: ticket?.college ?? '',
        ticketCode: ticket?.ticketCode ?? '',
      };
    });

  return NextResponse.json({
    eventId,
    count: records.length,
    totalRegistrations: event.registrationsCount,
    records,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: eventId } = await context.params;
  const body = (await request.json()) as {
    qrToken?: string;
    ticketCode?: string;
    userId?: string;
    teamId?: string;
    method?: 'qr' | 'manual';
  };

  const tokenOrCode = body.qrToken?.trim() || body.ticketCode?.trim();
  if (!tokenOrCode && !body.userId && !body.teamId) {
    return NextResponse.json(
      { status: 'INVALID_TICKET', error: 'QR token or ticket code is required.' },
      { status: 400 }
    );
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    // Verify event & organizer permission
    const { data: ev } = await supabase
      .from('events')
      .select('id, club_id')
      .eq('id', eventId)
      .single();

    if (!ev) {
      return NextResponse.json(
        { status: 'INVALID_TICKET', error: 'Event not found.' },
        { status: 404 }
      );
    }

    if (tokenOrCode) {
      const { data: reg } = await supabase
        .from('registrations')
        .select('*')
        .eq('event_id', eventId)
        .eq('status', 'registered')
        .or(`qr_token.eq.${tokenOrCode},ticket_code.eq.${tokenOrCode.toUpperCase()}`)
        .maybeSingle();

      if (!reg) {
        return NextResponse.json(
          {
            status: 'INVALID_TICKET',
            error: 'Ticket is invalid or does not belong to this event.',
          },
          { status: 404 }
        );
      }

      const attendee = {
        name: reg.attendee_name ?? 'Registered Student',
        email: reg.attendee_email ?? '',
        phone: reg.phone ?? '',
        college: reg.college ?? '',
        ticketCode: reg.ticket_code ?? '',
      };

      const { data: existingAtt } = await supabase
        .from('event_attendance')
        .select('*')
        .eq('event_id', eventId)
        .or(`registration_id.eq.${reg.id},user_id.eq.${reg.user_id}`)
        .maybeSingle();

      if (existingAtt) {
        return NextResponse.json({
          status: 'ALREADY_CHECKED_IN',
          attendance: existingAtt,
          attendee,
        });
      }

      const { data: inserted, error } = await supabase
        .from('event_attendance')
        .insert({
          event_id: eventId,
          registration_id: reg.id,
          user_id: reg.user_id,
          team_id: reg.team_id ?? null,
          check_in_method: body.method ?? 'qr',
        })
        .select('*')
        .single();

      if (error) {
        // Unique constraint race condition -> already checked in
        if (error.code === '23505') {
          return NextResponse.json({
            status: 'ALREADY_CHECKED_IN',
            attendee,
          });
        }
        return NextResponse.json({ error: error.message }, { status: 403 });
      }

      return NextResponse.json(
        { status: 'VALID', attendance: inserted, attendee },
        { status: 201 }
      );
    }

    // Legacy userId / teamId check-in path
    const { data: existing } = await supabase
      .from('event_attendance')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', body.userId ?? '')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        status: 'ALREADY_CHECKED_IN',
        attendance: existing,
      });
    }

    const { data: inserted, error } = await supabase
      .from('event_attendance')
      .insert({
        event_id: eventId,
        user_id: body.userId ?? null,
        team_id: body.teamId ?? null,
        check_in_method: body.method ?? 'manual',
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { status: 'VALID', attendance: inserted },
      { status: 201 }
    );
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json(
      { status: 'INVALID_TICKET', error: 'Event not found.' },
      { status: 404 }
    );
  }

  if (!canManageClub(user, event.clubId)) {
    return forbiddenResponse('Only organizers or admins can check in attendees.');
  }

  if (tokenOrCode) {
    const ticket = store.tickets.find(
      (t) =>
        t.eventId === eventId &&
        (t.qrToken === tokenOrCode ||
          t.ticketCode.toUpperCase() === tokenOrCode.toUpperCase())
    );

    if (!ticket) {
      return NextResponse.json(
        {
          status: 'INVALID_TICKET',
          error: 'Ticket is invalid or does not belong to this event.',
        },
        { status: 404 }
      );
    }

    const attendee = {
      name: ticket.attendeeName,
      email: ticket.attendeeEmail,
      phone: ticket.phone,
      college: ticket.college,
      ticketCode: ticket.ticketCode,
    };

    const existing = store.attendance.find(
      (a) => a.eventId === eventId && a.userId === ticket.userId
    );
    if (existing) {
      return NextResponse.json({
        status: 'ALREADY_CHECKED_IN',
        attendance: existing,
        attendee,
      });
    }

    const record: EventAttendance = {
      id: generateId('att'),
      eventId,
      userId: ticket.userId,
      teamId: ticket.teamId,
      checkInTime: new Date().toISOString(),
      checkInMethod: body.method ?? 'qr',
    };
    store.attendance.push(record);
    saveDemoStore(store);
    return NextResponse.json(
      { status: 'VALID', attendance: record, attendee },
      { status: 201 }
    );
  }

  const duplicate = store.attendance.find(
    (a) =>
      a.eventId === eventId &&
      ((body.userId && a.userId === body.userId) ||
        (body.teamId && a.teamId === body.teamId))
  );
  if (duplicate) {
    return NextResponse.json({
      status: 'ALREADY_CHECKED_IN',
      attendance: duplicate,
    });
  }

  const record: EventAttendance = {
    id: generateId('att'),
    eventId,
    userId: body.userId,
    teamId: body.teamId,
    checkInTime: new Date().toISOString(),
    checkInMethod: body.method ?? 'manual',
  };

  store.attendance.push(record);
  saveDemoStore(store);
  return NextResponse.json(
    { status: 'VALID', attendance: record },
    { status: 201 }
  );
}
