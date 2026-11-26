import { saveDemoStore } from '@/lib/server/store';
import { createOpaquePassCodes, issueCampusTicket, registrationSummary } from '@/lib/server/eventTicket';
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
  eventRole?: 'volunteer' | 'contestant';
  teamName?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  phone?: string;
  college?: string;
  customFields?: Record<string, string>;
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

  if (body.eventRole && !['volunteer','contestant'].includes(body.eventRole)) return NextResponse.json({error:'Choose contestant or volunteer.'},{status:400});
  const volunteering = body.eventRole === 'volunteer';
  const attendeeName = user.name;
  const attendeeEmail = user.email;
  const phone = body.phone?.trim() || '';
  const college = body.college?.trim() || '';
  const customFields = body.customFields ?? {};

  if (getDataMode() === 'supabase') {
    const { qrToken, ticketCode } = createOpaquePassCodes();
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
    const teamName = isSolo ? attendeeName + ' (Solo)' : body.teamName?.trim() || attendeeName + "'s Team";
    const {data: saved,error} = await supabase.rpc('register_event_participant',{
      p_event:eventId, p_kind:volunteering ? 'volunteer' : isSolo ? 'solo' : 'team', p_team_name:teamName,
      p_contact:{name:attendeeName,phone,college,customFields},p_ticket:ticketCode,p_qr:qrToken,
    });
    if (error || !saved) return NextResponse.json({error:error?.message ?? 'Registration failed.'},{status:409});
    const {team:createdTeam, registration:reg} = saved;
    if (volunteering) return NextResponse.json({ticket:{ticketCode},eventRole:'volunteer'},{status:201});

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
  if (alreadyRegistered || store.teams.some(t => t.eventId === eventId && t.members.some(m => m.userId === user.id))) {
    return NextResponse.json(
      { error: 'Student is already registered for this event.' },
      { status: 409 }
    );
  }

  if (!volunteering && event.maxTeams && store.teams.filter(t => t.eventId === eventId).length >= event.maxTeams) {
    return NextResponse.json({error: 'All team places have been taken.'}, {status: 409});
  }
  if (registrationSummary(store,event).remaining === 0) return NextResponse.json({error:'This event is full.'},{status:409});
  if (volunteering) {
    const ticket = issueCampusTicket(event, store.venues.find(v => v.id === event.venueId), user, undefined, {phone,college,customFields});
    ticket.eventRole = 'volunteer';
    store.tickets.push(ticket);
    event.registrationsCount += 1;
    saveDemoStore(store);
    return NextResponse.json({ticket,eventRole:'volunteer'},{status:201});
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

  const venue = store.venues.find(v => v.id === event.venueId);
  const ticket = issueCampusTicket(event, venue, user, team.id, { phone, college, customFields });

  store.teams.push(team);
  store.tickets.push(ticket);
  event.registrationsCount += 1;

  saveDemoStore(store);
  return NextResponse.json({ team, ticket }, { status: 201 });
}
