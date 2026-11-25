import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateGroundedNarrative } from '@/lib/server/gemini';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EventReport } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();
    const { data } = await supabase
      .from('event_reports')
      .select('*')
      .order('created_at', { ascending: false });
    return NextResponse.json({ reports: data ?? [] });
  }

  return NextResponse.json({ reports: getStore().reports });
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
      .select('*')
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
        .from('volunteer_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('confirmed', true),
      supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id),
    ]);

    const registrationsCount = regRes.count ?? 0;
    const attendanceCount = attRes.count ?? 0;
    const attendanceRate =
      registrationsCount > 0
        ? Number(((attendanceCount / registrationsCount) * 100).toFixed(1))
        : 0;
    const noShowCount = Math.max(0, registrationsCount - attendanceCount);
    const volunteerCount = volRes.count ?? 0;
    const submissionCount = subRes.count ?? 0;

    const metrics = {
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

    const { data: upserted } = await supabase
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

  const registrationsCount = event.registrationsCount;
  const attendanceCount = store.attendance.filter(
    (a) => a.eventId === event.id
  ).length;
  const attendanceRate =
    registrationsCount > 0
      ? Number(((attendanceCount / registrationsCount) * 100).toFixed(1))
      : 0;
  const noShowCount = Math.max(0, registrationsCount - attendanceCount);
  const volunteerCount = store.volunteerAssignments.filter(
    (v) => v.eventId === event.id && v.confirmed
  ).length;
  const submissionCount = store.submissions.filter(
    (s) => s.eventId === event.id
  ).length;

  const metrics = {
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

  return NextResponse.json({ report, usedGemini }, { status: 201 });
}
