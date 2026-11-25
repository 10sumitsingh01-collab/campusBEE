import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  getRequestUser,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  AIRecommendation,
  CampusEvent,
  Club,
  ClubActivityMetric,
  Venue,
} from '@/types/domain';

export async function GET(request: NextRequest) {
  const mode = getDataMode();
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const [clubsRes, venuesRes, eventsRes, teamsRes, invitesRes, recsRes, metricsRes] =
      await Promise.all([
        supabase.from('clubs').select('*').order('name'),
        supabase.from('venues').select('*').order('name'),
        supabase.from('events').select('*').order('start_time'),
        supabase
          .from('teams')
          .select('*, team_members(user_id, role, status)')
          .order('created_at', { ascending: false }),
        supabase
          .from('team_invites')
          .select('*, teams(name)')
          .ilike('invited_email', user.email),
        user.role === 'club_organizer' || user.role === 'college_admin'
          ? supabase
              .from('ai_recommendations')
              .select('*')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        user.role === 'club_organizer' || user.role === 'college_admin'
          ? supabase.from('club_activity_metrics').select('*')
          : Promise.resolve({ data: [] }),
      ]);

    const clubs: Club[] = (clubsRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? '',
      category: c.category,
      interests: c.interests ?? [],
      capabilities: c.capabilities ?? [],
      status: c.status,
      ownerId: c.owner_id,
      memberCount: 0,
    }));

    const venues: Venue[] = (venuesRes.data ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      building: v.building,
      capacity: v.capacity,
      equipment: v.equipment ?? [],
    }));

    const events: CampusEvent[] = (eventsRes.data ?? []).map((e) => ({
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

    const recommendations: AIRecommendation[] = (recsRes.data ?? []).map(
      (r) => ({
        id: r.id,
        type: r.type,
        eventId: r.event_id ?? undefined,
        clubId: r.club_id ?? undefined,
        title: r.title,
        summary: r.summary,
        explanation: r.explanation,
        sourceRecords: Array.isArray(r.source_records) ? r.source_records : [],
        confidenceScore: Number(r.confidence_score ?? 0.8),
        priority: r.priority,
        status: r.status,
        createdByAgent: r.created_by_agent,
        createdAt: r.created_at,
      })
    );

    const clubMetrics: ClubActivityMetric[] = (metricsRes.data ?? []).map(
      (m) => ({
        clubId: m.club_id,
        periodLabel: `${m.period_start} to ${m.period_end}`,
        eventCount: m.event_count,
        registrationsCount: m.registrations_count,
        attendanceCount: m.attendance_count,
        activeMembersCount: m.active_members_count,
        volunteerParticipationCount: m.volunteer_participation_count,
      })
    );

    const teams = (teamsRes.data ?? []).map((t) => ({
      id: t.id,
      eventId: t.event_id,
      name: t.name,
      leaderId: t.leader_id,
      status: t.status,
      lockedAt: t.locked_at ?? undefined,
      members: Array.isArray(t.team_members)
        ? t.team_members
            .filter((m: { status: string }) => m.status === 'accepted')
            .map((m: { user_id: string; role: 'leader' | 'member' }) => ({
              userId: m.user_id,
              name: m.user_id === user.id ? user.name : 'Teammate',
              email: m.user_id === user.id ? user.email : '',
              role: m.role,
            }))
        : [],
    }));

    const invites = (invitesRes.data ?? []).map((i) => {
      const teamObj = Array.isArray(i.teams) ? i.teams[0] : i.teams;
      return {
        id: i.id,
        teamId: i.team_id,
        eventId: i.event_id,
        teamName: teamObj?.name ?? 'Team',
        invitedEmail: i.invited_email ?? '',
        status: i.status,
        expiresAt: i.expires_at,
      };
    });

    return NextResponse.json({
      dataMode: mode,
      user,
      clubs,
      venues,
      events,
      teams,
      invites,
      recommendations,
      clubMetrics,
    });
  }

  const store = getStore();
  const visibleEvents = store.events.filter(
    (ev) => ev.status !== 'draft' || canManageClub(user, ev.clubId)
  );

  return NextResponse.json({
    dataMode: mode,
    user,
    clubs: store.clubs,
    venues: store.venues,
    events: visibleEvents,
    teams: store.teams,
    invites: store.invites.filter(
      (i) => i.invitedEmail.toLowerCase() === user.email.toLowerCase()
    ),
    recommendations:
      user.role === 'club_organizer' || user.role === 'college_admin'
        ? store.recommendations
        : [],
    clubMetrics: store.clubMetrics,
  });
}
