import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkStudentEligibility } from '@/lib/registration/teamRules';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CampusEvent, EventTicket, Team } from '@/types/domain';

interface RegisterPayload {
  teamName?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  phone?: string;
  college?: string;
  customFields?: Record<string, string>;
}

function createOpaquePassCodes() {
  const qrToken = crypto.randomBytes(32).toString('hex');
  const ticketCode = `TKT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  return { qrToken, ticketCode };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['student']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: eventId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as RegisterPayload;

  const attendeeName = body.attendeeName?.trim() || user.name;
  const attendeeEmail = body.attendeeEmail?.trim() || user.email;
  const phone = body.phone?.trim() || '';
  const college = body.college?.trim() || '';
  const customFields = body.customFields ?? {};

  const { qrToken, ticketCode } = createOpaquePassCodes();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: ev } = await supabase
      .from('events')
      .select('*, venues(name, building)')
      .eq('id', eventId)
      .single();

    if (!ev || ev.status !== 'published') {
      return NextResponse.json(
        { error: 'Published event not found.' },
        { status: 404 }
      );
    }

    const mappedEvent: CampusEvent = {
      id: ev.id,
      clubId: ev.club_id,
      title: ev.title,
      description: ev.description ?? '',
      eventType: ev.event_type,
      tags: ev.tags ?? [],
      eligibilityDepartments: ev.eligibility_departments ?? ['All Departments'],
      eligibilityYears: ev.eligibility_years ?? [1, 2, 3, 4],
      minTeamSize: ev.min_team_size,
      maxTeamSize: ev.max_team_size,
      registrationDeadline: ev.registration_deadline,
      submissionDeadline: ev.submission_deadline ?? undefined,
      startTime: ev.start_time,
      endTime: ev.end_time,
      setupBufferMinutes: ev.setup_buffer_minutes,
      teardownBufferMinutes: ev.teardown_buffer_minutes,
      venueId: ev.venue_id ?? '',
      status: ev.status,
      registrationsCount: 0,
    };

    const eligibility = checkStudentEligibility(user, mappedEvent);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: eligibility.reason ?? 'Not eligible for this event.' },
        { status: 400 }
      );
    }

    const { data: existingReg } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .eq('status', 'registered')
      .maybeSingle();

    if (existingReg) {
      return NextResponse.json(
        { error: 'Student is already registered for this event.' },
        { status: 409 }
      );
    }

    const isSolo = ev.max_team_size === 1;
    const teamName = isSolo
      ? `${attendeeName} (Solo)`
      : body.teamName?.trim() || `${attendeeName.split(' ')[0]}'s Team`;

    const { data: createdTeam, error: teamErr } = await supabase
      .from('teams')
      .insert({
        event_id: eventId,
        name: teamName,
        leader_id: user.id,
        status: isSolo ? 'locked' : 'forming',
        locked_at: isSolo ? new Date().toISOString() : null,
      })
      .select('*')
      .single();

    if (teamErr || !createdTeam) {
      return NextResponse.json(
        { error: teamErr?.message ?? 'Failed to create team.' },
        { status: 400 }
      );
    }

    await supabase.from('team_members').insert({
      team_id: createdTeam.id,
      event_id: eventId,
      user_id: user.id,
      role: 'leader',
      status: 'accepted',
    });

    const { data: reg, error: regErr } = await supabase
      .from('registrations')
      .upsert(
        {
          event_id: eventId,
          user_id: user.id,
          team_id: createdTeam.id,
          registration_type: isSolo ? 'solo' : 'team',
          status: 'registered',
          attendee_name: attendeeName,
          attendee_email: attendeeEmail,
          phone,
          college,
          custom_fields: customFields,
          ticket_code: ticketCode,
          qr_token: qrToken,
        },
        { onConflict: 'event_id,user_id' }
      )
      .select('*')
      .single();

    if (regErr || !reg) {
      return NextResponse.json(
        { error: regErr?.message ?? 'Failed to save registration.' },
        { status: 400 }
      );
    }

    const venueObj = Array.isArray(ev.venues) ? ev.venues[0] : ev.venues;
    const ticket: EventTicket = {
      id: reg.id,
      eventId,
      eventTitle: ev.title,
      eventStartTime: ev.start_time,
      eventEndTime: ev.end_time,
      venueName: venueObj?.name ?? 'Campus Venue',
      venueBuilding: venueObj?.building ?? 'Campus',
      userId: user.id,
      teamId: createdTeam.id,
      attendeeName,
      attendeeEmail,
      phone,
      college,
      customFields,
      ticketCode: reg.ticket_code,
      qrToken: reg.qr_token,
      status: 'registered',
      registeredAt: reg.registered_at,
    };

    return NextResponse.json(
      {
        team: {
          id: createdTeam.id,
          eventId: createdTeam.event_id,
          name: createdTeam.name,
          leaderId: createdTeam.leader_id,
          status: createdTeam.status,
          lockedAt: createdTeam.locked_at ?? undefined,
          members: [
            {
              userId: user.id,
              name: attendeeName,
              email: attendeeEmail,
              role: 'leader',
            },
          ],
        },
        ticket,
      },
      { status: 201 }
    );
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event || event.status !== 'published') {
    return NextResponse.json(
      { error: 'Published event not found.' },
      { status: 404 }
    );
  }

  const eligibility = checkStudentEligibility(user, event);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility.reason ?? 'Not eligible for this event.' },
      { status: 400 }
    );
  }

  const alreadyRegistered = store.tickets.some(
    (t) => t.eventId === eventId && t.userId === user.id
  );
  if (alreadyRegistered) {
    return NextResponse.json(
      { error: 'Student is already registered for this event.' },
      { status: 409 }
    );
  }

  const isSolo = event.maxTeamSize === 1;
  const teamName = isSolo
    ? `${attendeeName} (Solo)`
    : body.teamName?.trim() || `${attendeeName.split(' ')[0]}'s Team`;

  const team: Team = {
    id: generateId('team'),
    eventId,
    name: teamName,
    leaderId: user.id,
    status: isSolo ? 'locked' : 'forming',
    lockedAt: isSolo ? new Date().toISOString() : undefined,
    members: [
      {
        userId: user.id,
        name: attendeeName,
        email: attendeeEmail,
        role: 'leader',
      },
    ],
  };

  const venue = store.venues.find((v) => v.id === event.venueId);
  const ticket: EventTicket = {
    id: generateId('reg'),
    eventId,
    eventTitle: event.title,
    eventStartTime: event.startTime,
    eventEndTime: event.endTime,
    venueName: venue?.name ?? 'Campus Venue',
    venueBuilding: venue?.building ?? 'Campus',
    userId: user.id,
    teamId: team.id,
    attendeeName,
    attendeeEmail,
    phone,
    college,
    customFields,
    ticketCode,
    qrToken,
    status: 'registered',
    registeredAt: new Date().toISOString(),
  };

  store.teams.push(team);
  store.tickets.push(ticket);
  event.registrationsCount += 1;

  return NextResponse.json({ team, ticket }, { status: 201 });
}
