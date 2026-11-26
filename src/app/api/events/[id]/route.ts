import { saveDemoStore } from '@/lib/server/store';
import { NextRequest, NextResponse } from 'next/server';
import { checkCandidateEventClashes } from '@/lib/coordination/clashCheck';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CampusEvent } from '@/types/domain';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const store = getStore();
  const event = store.events.find((e) => e.id === id);
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (['draft','pending_approval'].includes(event.status) && !canManageClub(user, event.clubId)) {
    return forbiddenResponse('Draft events are restricted to club organizers.');
  }

  const club = store.clubs.find((c) => c.id === event.clubId);
  const venue = store.venues.find((v) => v.id === event.venueId);
  const clashes = checkCandidateEventClashes(event, store.events, store.venues);

  return NextResponse.json({ event, club, venue, clashes });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const body = (await request.json()) as Partial<CampusEvent>;

  const expectedStatus = request.nextUrl.searchParams.get('from');
  function transitionError(current: CampusEvent['status']) {
    if (expectedStatus && expectedStatus !== current) return NextResponse.json({error:'The request has already changed. Refresh the queue.'},{status:409});
    if (user?.role !== 'college_admin' && body.status && body.status !== current &&
        !(current === 'draft' && body.status === 'pending_approval') && body.status !== 'cancelled') {
      return forbiddenResponse('College admin approval is required to publish an event.');
    }
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: existing } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const invalid = transitionError(existing.status);
    if (invalid) return invalid;
    if (request.nextUrl.searchParams.get('resolveClash') === '1') {
      if (user.role !== 'college_admin') {
        const { data: club } = await supabase.from('clubs').select('owner_id').eq('id', existing.club_id).maybeSingle();
        if (club?.owner_id !== user.id) return forbiddenResponse();
      }
      const target = body.venueId ?? existing.venue_id;
      const check = await supabase.rpc('detect_venue_clashes', { p_event_id: id, p_venue_id: target,
        p_start_time: body.startTime ?? existing.start_time, p_end_time: body.endTime ?? existing.end_time,
        p_setup_minutes: existing.setup_buffer_minutes, p_teardown_minutes: existing.teardown_buffer_minutes });
      const {data: room} = await supabase.from('venues').select('capacity').eq('id',target).maybeSingle();
      const bookings = await supabase.from('registrations').select('id',{count:'exact',head:true}).eq('event_id',id).eq('status','registered');
      if (check.error || bookings.error || !room || room.capacity < (bookings.count ?? 0) || check.data?.length)
        return NextResponse.json({error:'This booking could not be confirmed. Refresh the suggestions.'},{status:409});
    }

    const { data: updated, error } = await supabase
      .from('events')
      .update({
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        venue_id: body.venueId ?? existing.venue_id,
        start_time: body.startTime ?? existing.start_time,
        end_time: body.endTime ?? existing.end_time,
        status: body.status ?? existing.status,
      })
      .eq('id', id)
      .eq('status', existing.status)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({
      event: {
        id: updated.id,
        clubId: updated.club_id,
        title: updated.title,
        description: updated.description ?? '',
        eventType: updated.event_type,
        tags: updated.tags ?? [],
        eligibilityDepartments: updated.eligibility_departments ?? ['All Departments'],
        eligibilityYears: updated.eligibility_years ?? [1, 2, 3, 4],
        minTeamSize: updated.min_team_size,
        maxTeamSize: updated.max_team_size,
        registrationDeadline: updated.registration_deadline,
        submissionDeadline: updated.submission_deadline ?? undefined,
        startTime: updated.start_time,
        endTime: updated.end_time,
        setupBufferMinutes: updated.setup_buffer_minutes,
        teardownBufferMinutes: updated.teardown_buffer_minutes,
        venueId: updated.venue_id ?? '',
        status: updated.status,
        registrationsCount: 0,
      },
      clashes: [],
    });
  }

  const store = getStore();
  const idx = store.events.findIndex((e) => e.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const existing = store.events[idx];
  if (!canManageClub(user, existing.clubId)) {
    return forbiddenResponse('Only this club’s organizer or admin can edit it.');
  }

  const invalid = transitionError(existing.status);
  if (invalid) return invalid;
  const updated: CampusEvent = {
    ...existing,
    ...body,
    id: existing.id,
    clubId: existing.clubId,
  };

  if (new Date(updated.endTime).getTime() <= new Date(updated.startTime).getTime()) {
    return NextResponse.json(
      { error: 'endTime must be after startTime.' },
      { status: 400 }
    );
  }

  const clashes = checkCandidateEventClashes(updated, store.events, store.venues);
  if (request.nextUrl.searchParams.get('resolveClash') === '1') {
    const venue = store.venues.find(v => v.id === updated.venueId);
    if (!venue || venue.capacity < existing.registrationsCount || clashes.length) {
      return NextResponse.json({ error: 'This venue is no longer available. Scan for a current alternative.' }, { status: 409 });
    }
  }
  store.events[idx] = updated;

  saveDemoStore(store);
  return NextResponse.json({ event: updated, clashes });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();
    const { data, error } = await supabase
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ event: data });
  }

  const store = getStore();
  const idx = store.events.findIndex((e) => e.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (!canManageClub(user, store.events[idx].clubId)) {
    return forbiddenResponse('Only this club’s organizer or admin can cancel it.');
  }

  store.events[idx] = { ...store.events[idx], status: 'cancelled' };
  saveDemoStore(store);
  return NextResponse.json({ event: store.events[idx] });
}
