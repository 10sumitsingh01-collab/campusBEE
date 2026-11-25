import { NextRequest, NextResponse } from 'next/server';
import { checkCandidateEventClashes } from '@/lib/coordination/clashCheck';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CampusEvent } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const clubId = searchParams.get('clubId');
  const status = searchParams.get('status');
  const q = searchParams.get('q')?.toLowerCase();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    let query = supabase.from('events').select('*').order('start_time');
    if (type) query = query.eq('event_type', type);
    if (clubId) query = query.eq('club_id', clubId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let events: CampusEvent[] = (data ?? []).map((e) => ({
      id: e.id,
      clubId: e.club_id,
      title: e.title,
      description: e.description ?? '',
      eventType: e.event_type as CampusEvent['eventType'],
      tags: e.tags ?? [],
      eligibilityDepartments: e.eligibility_departments ?? ['All Departments'],
      eligibilityYears: e.eligibility_years ?? [1, 2, 3, 4],
      minTeamSize: e.min_team_size,
      maxTeamSize: e.max_team_size,
      registrationDeadline: e.registration_deadline,
      submissionDeadline: e.submission_deadline ?? undefined,
      startTime: e.start_time,
      endTime: e.end_time,
      setupBufferMinutes: e.setup_buffer_minutes,
      teardownBufferMinutes: e.teardown_buffer_minutes,
      venueId: e.venue_id ?? '',
      status: e.status,
      registrationsCount: 0,
    }));

    if (q) {
      events = events.filter(
        (ev) =>
          ev.title.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q) ||
          ev.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ events });
  }

  const store = getStore();
  const events = store.events.filter((ev) => {
    if (ev.status === 'draft' && !canManageClub(user, ev.clubId)) return false;
    if (type && ev.eventType !== type) return false;
    if (clubId && ev.clubId !== clubId) return false;
    if (status && ev.status !== status) return false;
    if (q) {
      const hit =
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.tags.some((t) => t.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json()) as Partial<CampusEvent>;
  if (!body.title?.trim() || !body.clubId || !body.startTime || !body.endTime) {
    return NextResponse.json(
      { error: 'title, clubId, startTime, and endTime are required.' },
      { status: 400 }
    );
  }

  if (new Date(body.endTime).getTime() <= new Date(body.startTime).getTime()) {
    return NextResponse.json(
      { error: 'endTime must be after startTime.' },
      { status: 400 }
    );
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: inserted, error } = await supabase
      .from('events')
      .insert({
        club_id: body.clubId,
        title: body.title.trim(),
        description: body.description?.trim() ?? '',
        event_type: body.eventType ?? 'Workshop',
        tags: body.tags ?? [],
        eligibility_departments: body.eligibilityDepartments ?? ['All Departments'],
        eligibility_years: body.eligibilityYears ?? [1, 2, 3, 4],
        min_team_size: body.minTeamSize ?? 1,
        max_team_size: Math.max(body.minTeamSize ?? 1, body.maxTeamSize ?? 4),
        registration_deadline: body.registrationDeadline ?? body.startTime,
        submission_deadline: body.submissionDeadline ?? null,
        start_time: body.startTime,
        end_time: body.endTime,
        setup_buffer_minutes: body.setupBufferMinutes ?? 30,
        teardown_buffer_minutes: body.teardownBufferMinutes ?? 30,
        venue_id: body.venueId || null,
        status: body.status ?? 'draft',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    const clashesRes = inserted.venue_id
      ? await supabase.rpc('detect_venue_clashes', {
          p_event_id: inserted.id,
          p_venue_id: inserted.venue_id,
          p_start_time: inserted.start_time,
          p_end_time: inserted.end_time,
          p_setup_minutes: inserted.setup_buffer_minutes,
          p_teardown_minutes: inserted.teardown_buffer_minutes,
        })
      : { data: [] };

    return NextResponse.json(
      {
        event: {
          id: inserted.id,
          clubId: inserted.club_id,
          title: inserted.title,
          description: inserted.description ?? '',
          eventType: inserted.event_type,
          tags: inserted.tags ?? [],
          eligibilityDepartments: inserted.eligibility_departments ?? ['All Departments'],
          eligibilityYears: inserted.eligibility_years ?? [1, 2, 3, 4],
          minTeamSize: inserted.min_team_size,
          maxTeamSize: inserted.max_team_size,
          registrationDeadline: inserted.registration_deadline,
          submissionDeadline: inserted.submission_deadline ?? undefined,
          startTime: inserted.start_time,
          endTime: inserted.end_time,
          setupBufferMinutes: inserted.setup_buffer_minutes,
          teardownBufferMinutes: inserted.teardown_buffer_minutes,
          venueId: inserted.venue_id ?? '',
          status: inserted.status,
          registrationsCount: 0,
        },
        clashes: clashesRes.data ?? [],
      },
      { status: 201 }
    );
  }

  if (!canManageClub(user, body.clubId)) {
    return forbiddenResponse(
      'You can only create events for clubs you manage.'
    );
  }

  const store = getStore();
  const newEvent: CampusEvent = {
    id: generateId('evt'),
    clubId: body.clubId,
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    eventType: body.eventType ?? 'Workshop',
    tags: body.tags ?? [],
    eligibilityDepartments: body.eligibilityDepartments ?? ['All Departments'],
    eligibilityYears: body.eligibilityYears ?? [1, 2, 3, 4],
    minTeamSize: body.minTeamSize ?? 1,
    maxTeamSize: Math.max(body.minTeamSize ?? 1, body.maxTeamSize ?? 4),
    registrationDeadline: body.registrationDeadline ?? body.startTime,
    submissionDeadline: body.submissionDeadline,
    startTime: body.startTime,
    endTime: body.endTime,
    setupBufferMinutes: body.setupBufferMinutes ?? 30,
    teardownBufferMinutes: body.teardownBufferMinutes ?? 30,
    venueId: body.venueId ?? store.venues[0]?.id ?? '',
    status: body.status ?? 'draft',
    registrationsCount: 0,
  };

  const clashes = checkCandidateEventClashes(
    newEvent,
    store.events,
    store.venues
  );
  store.events.push(newEvent);

  return NextResponse.json({ event: newEvent, clashes }, { status: 201 });
}
