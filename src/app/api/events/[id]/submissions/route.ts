import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Submission } from '@/types/domain';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id: eventId } = await context.params;

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    // RLS policy submissions_select_team_judge_organizer enforces visibility
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('event_id', eventId)
      .order('submitted_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const submissions: Submission[] = (data ?? []).map((s) => ({
      id: s.id,
      eventId: s.event_id,
      teamId: s.team_id,
      title: s.title,
      description: s.description ?? '',
      links: Array.isArray(s.links) ? s.links : [],
      fileUrls: s.file_urls ?? [],
      submittedBy: s.submitted_by,
      submittedAt: s.submitted_at,
    }));

    return NextResponse.json({ submissions });
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const all = store.submissions.filter((s) => s.eventId === eventId);

  if (canManageClub(user, event.clubId)) {
    return NextResponse.json({ submissions: all });
  }

  if (user.role === 'judge') {
    const assignedIds = new Set(
      store.judgeAssignments
        .filter((ja) => ja.eventId === eventId && ja.judgeId === user.id)
        .map((ja) => ja.submissionId)
    );
    return NextResponse.json({
      submissions: all.filter((s) => assignedIds.has(s.id)),
    });
  }

  const myTeamIds = new Set(
    store.teams
      .filter(
        (t) =>
          t.eventId === eventId && t.members.some((m) => m.userId === user.id)
      )
      .map((t) => t.id)
  );
  return NextResponse.json({
    submissions: all.filter((s) => myTeamIds.has(s.teamId)),
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['student']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: eventId } = await context.params;
  const body = (await request.json()) as Partial<Submission>;
  if (!body.title?.trim()) {
    return NextResponse.json(
      { error: 'Submission title is required.' },
      { status: 400 }
    );
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: event } = await supabase
      .from('events')
      .select('id, submission_deadline')
      .eq('id', eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    if (
      event.submission_deadline &&
      Date.now() > new Date(event.submission_deadline).getTime()
    ) {
      return NextResponse.json(
        { error: 'Submission deadline has passed.' },
        { status: 400 }
      );
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id, teams!inner(id, status)')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (!membership) {
      return forbiddenResponse(
        'You are not a member of any team for this event.'
      );
    }

    const teamInfo = Array.isArray(membership.teams)
      ? membership.teams[0]
      : membership.teams;
    if (teamInfo?.status !== 'locked') {
      return NextResponse.json(
        { error: 'Team must be locked before submitting work.' },
        { status: 400 }
      );
    }

    const { data: saved, error } = await supabase
      .from('submissions')
      .upsert(
        {
          event_id: eventId,
          team_id: membership.team_id,
          title: body.title.trim(),
          description: body.description?.trim() ?? '',
          links: body.links ?? [],
          file_urls: body.fileUrls ?? [],
          submitted_by: user.id,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,team_id' }
      )
      .select('*')
      .single();

    if (error || !saved) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to save submission.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        submission: {
          id: saved.id,
          eventId: saved.event_id,
          teamId: saved.team_id,
          title: saved.title,
          description: saved.description ?? '',
          links: Array.isArray(saved.links) ? saved.links : [],
          fileUrls: saved.file_urls ?? [],
          submittedBy: saved.submitted_by,
          submittedAt: saved.submitted_at,
        },
      },
      { status: 201 }
    );
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  if (
    event.submissionDeadline &&
    Date.now() > new Date(event.submissionDeadline).getTime()
  ) {
    return NextResponse.json(
      { error: 'Submission deadline has passed.' },
      { status: 400 }
    );
  }

  const team = store.teams.find(
    (t) =>
      t.eventId === eventId && t.members.some((m) => m.userId === user.id)
  );
  if (!team) {
    return forbiddenResponse('You are not a member of any team for this event.');
  }

  if (team.status !== 'locked') {
    return NextResponse.json(
      { error: 'Team must be locked before submitting work.' },
      { status: 400 }
    );
  }

  const existingIdx = store.submissions.findIndex(
    (s) => s.eventId === eventId && s.teamId === team.id
  );
  const submission: Submission = {
    id: existingIdx >= 0 ? store.submissions[existingIdx].id : generateId('sub'),
    eventId,
    teamId: team.id,
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    links: body.links ?? [],
    fileUrls: body.fileUrls ?? [],
    submittedBy: user.id,
    submittedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    store.submissions[existingIdx] = submission;
  } else {
    store.submissions.push(submission);
  }

  return NextResponse.json(
    { submission },
    { status: existingIdx >= 0 ? 200 : 201 }
  );
}
