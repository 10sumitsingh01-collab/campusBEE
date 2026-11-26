import {registrationSummary} from '@/lib/server/eventTicket';
import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateGroundedNarrative } from '@/lib/server/gemini';
import { generateId, getDataMode, getStore, saveDemoStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EventReport } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const eventId = request.nextUrl.searchParams.get('eventId');
  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();
    let query = supabase
      .from('event_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (eventId) query = query.eq('event_id', eventId);
    const { data, error } = await query;
    if (error) return NextResponse.json({error:'Could not load saved reports.'},{status:503});
    return NextResponse.json({reports:(data ?? []).map(row=>({
      id:row.id, eventId:row.event_id, verifiedMetricsSnapshot:row.verified_metrics_snapshot,
      generatedNarrative:row.generated_narrative, approvalStatus:row.approval_status,
      organizerNotes:row.organizer_notes, createdAt:row.created_at,
    }))});
  }

  const store = getStore();
  const allowed = new Set(store.events.filter(event=>canManageClub(user,event.clubId)).map(event=>event.id));
  return NextResponse.json({reports:store.reports.filter(report=>allowed.has(report.eventId) && (!eventId || report.eventId===eventId))});
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json()) as {
    eventId?: string;
    organizerNotes?: string;
  };
  if (!body.eventId) {
    return NextResponse.json(
      { error: 'eventId is required.' },
      { status: 400 }
    );
  }

  const mode = getDataMode();

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: event } = await supabase
      .from('events')
      .select('*, venues(capacity)')
      .eq('id', body.eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const [regRes, attRes, volRes, subRes] = await Promise.all([
      supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('status', 'registered'),
      supabase
        .from('event_attendance')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id),
      supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id).eq('registration_type','volunteer').eq('status','registered'),
      supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id),
    ]);

    if ([regRes,attRes,volRes,subRes].some(result=>result.error)) return NextResponse.json({error:'Unable to verify report totals.'},{status:503});
    const registrationsCount = regRes.count ?? 0;
    const capacity = (Array.isArray(event.venues) ? event.venues[0] : event.venues)?.capacity ?? null;
    const remaining = capacity===null ? null : Math.max(0,capacity-registrationsCount);
    const attendanceCount = attRes.count ?? 0;
    const attendanceRate =
      registrationsCount > 0
        ? Number(((attendanceCount / registrationsCount) * 100).toFixed(1))
        : 0;
    const noShowCount = Math.max(0, registrationsCount - attendanceCount);
    const volunteerCount = volRes.count ?? 0;
    const submissionCount = subRes.count ?? 0;

    const metrics = {
      capacity, remaining, registrationsCount,
      attendanceCount,
      attendanceRate,
      noShowCount,
      volunteerCount,
      submissionCount,
    };

    const fallbackNarrative = `${event.title} recorded ${registrationsCount} registrations, ${attendanceCount} checked-in attendees (${attendanceRate}% attendance rate, ${noShowCount} no-shows), ${volunteerCount} confirmed volunteers, and ${submissionCount} project submissions.${body.organizerNotes ? ` Organizer notes: ${body.organizerNotes}` : ''}`;

    const { text: generatedNarrative, usedGemini } =
      await generateGroundedNarrative(
        `Write a concise post-event report summary using ONLY these verified numbers for "${event.title}": registrations=${registrationsCount}, attendance=${attendanceCount}, attendanceRate=${attendanceRate}%, noShows=${noShowCount}, volunteers=${volunteerCount}, submissions=${submissionCount}. Notes: ${body.organizerNotes ?? 'None'}. Do not invent any additional metrics.`,
        fallbackNarrative
      );

    const { data: upserted, error: saveError } = await supabase
      .from('event_reports')
      .upsert(
        {
          event_id: event.id,
          verified_metrics_snapshot: metrics,
          generated_narrative: generatedNarrative,
          organizer_notes: body.organizerNotes ?? '',
          approval_status: 'draft',
        },
        { onConflict: 'event_id' }
      )
      .select('*')
      .single();

    if (saveError || !upserted) return NextResponse.json({error:'Unable to save the report for this event.'},{status:503});
    const report: EventReport = {
      id: upserted?.id ?? generateId('rep'),
      eventId: event.id,
      verifiedMetricsSnapshot: metrics,
      generatedNarrative,
      organizerNotes: body.organizerNotes ?? '',
      approvalStatus: 'draft',
      createdAt: upserted?.created_at ?? new Date().toISOString(),
    };

    return NextResponse.json({ report, usedGemini }, { status: 201 });
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === body.eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  if (!canManageClub(user, event.clubId)) {
    return forbiddenResponse(
      'You can only generate reports for your own club’s events.'
    );
  }

  const {capacity,registered:registrationsCount,remaining} = registrationSummary(store,event);
  const attendanceCount = store.attendance.filter(
    (a) => a.eventId === event.id
  ).length;
  const attendanceRate =
    registrationsCount > 0
      ? Number(((attendanceCount / registrationsCount) * 100).toFixed(1))
      : 0;
  const noShowCount = Math.max(0, registrationsCount - attendanceCount);
  const volunteerCount = new Set([...store.volunteerAssignments.filter(v => v.eventId === event.id && v.confirmed).map(v => v.userId),
    ...store.tickets.filter(t => t.eventId === event.id && t.eventRole === 'volunteer' && t.status === 'registered').map(t => t.userId)]).size;
  const submissionCount = store.submissions.filter(
    (s) => s.eventId === event.id
  ).length;

  const metrics = {
    capacity,remaining,
    registrationsCount,
    attendanceCount,
    attendanceRate,
    noShowCount,
    volunteerCount,
    submissionCount,
  };

  const fallbackNarrative = `${event.title} recorded ${registrationsCount} registrations, ${attendanceCount} checked-in attendees (${attendanceRate}% attendance rate, ${noShowCount} no-shows), ${volunteerCount} confirmed volunteers, and ${submissionCount} project submissions.${body.organizerNotes ? ` Organizer notes: ${body.organizerNotes}` : ''}`;

  const { text: generatedNarrative, usedGemini } =
    await generateGroundedNarrative(
      `Write a concise post-event report summary using ONLY these verified numbers for "${event.title}": registrations=${registrationsCount}, attendance=${attendanceCount}, attendanceRate=${attendanceRate}%, noShows=${noShowCount}, volunteers=${volunteerCount}, submissions=${submissionCount}. Notes: ${body.organizerNotes ?? 'None'}. Do not invent any additional metrics.`,
      fallbackNarrative
    );

  const report: EventReport = {
    id: generateId('rep'),
    eventId: event.id,
    verifiedMetricsSnapshot: metrics,
    generatedNarrative,
    organizerNotes: body.organizerNotes ?? '',
    approvalStatus: 'draft',
    createdAt: new Date().toISOString(),
  };

  store.reports = [
    ...store.reports.filter((r) => r.eventId !== event.id),
    report,
  ];

  saveDemoStore(store);
  return NextResponse.json({ report, usedGemini }, { status: 201 });
}
