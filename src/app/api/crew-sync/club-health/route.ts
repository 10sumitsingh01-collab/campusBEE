import { NextRequest, NextResponse } from 'next/server';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateGroundedNarrative } from '@/lib/server/gemini';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Club, ClubActivityMetric } from '@/types/domain';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as { clubId?: string };
  const mode = getDataMode();

  let clubs: Club[] = [];
  let metrics: ClubActivityMetric[] = [];

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const [clubsRes, metricsRes] = await Promise.all([
      supabase.from('clubs').select('*'),
      supabase
        .from('club_activity_metrics')
        .select('*')
        .order('period_start', { ascending: true }),
    ]);

    clubs = (clubsRes.data ?? []).map((c) => ({
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

    metrics = (metricsRes.data ?? []).map((m) => ({
      clubId: m.club_id,
      periodLabel: `${m.period_start} to ${m.period_end}`,
      eventCount: m.event_count,
      registrationsCount: m.registrations_count,
      attendanceCount: m.attendance_count,
      activeMembersCount: m.active_members_count,
      volunteerParticipationCount: m.volunteer_participation_count,
    }));
  } else {
    const store = getStore();
    clubs = store.clubs;
    metrics = store.clubMetrics;
  }

  const clubsToAssess = body.clubId
    ? clubs.filter((c) => c.id === body.clubId)
    : clubs;

  const assessments = await Promise.all(
    clubsToAssess.map(async (club) => {
      const periods = metrics.filter((m) => m.clubId === club.id);

      // Low-data safeguard: require at least 2 comparable periods
      if (periods.length < 2) {
        return {
          clubId: club.id,
          clubName: club.name,
          status: 'insufficient_data' as const,
          periodsAnalyzed: periods.length,
          message:
            'Insufficient historical data (fewer than 2 comparable periods) to infer an activity decline.',
          revivalSuggestions: [],
        };
      }

      const previous = periods[periods.length - 2];
      const current = periods[periods.length - 1];
      const memberDropPct =
        previous.activeMembersCount > 0
          ? Math.round(
              ((previous.activeMembersCount - current.activeMembersCount) /
                previous.activeMembersCount) *
                100
            )
          : 0;

      const isDeclining =
        current.eventCount < previous.eventCount && memberDropPct >= 25;

      let message = 'Club activity is stable across recent periods.';
      const revivalSuggestions = isDeclining
        ? [
            'Host a beginner-friendly 90-minute hands-on workshop.',
            'Co-brand a joint track with Coding Club or Design Club.',
            'Run a quick member feedback poll and recognize active volunteers.',
          ]
        : [];

      if (isDeclining) {
        const fallbackMsg = `Active members declined ${memberDropPct}% (${previous.activeMembersCount} -> ${current.activeMembersCount}) and events dropped from ${previous.eventCount} to ${current.eventCount}.`;
        const { text } = await generateGroundedNarrative(
          `Summarize this college club activity dip in 1 concise sentence without inventing causes: ${club.name} active members went from ${previous.activeMembersCount} to ${current.activeMembersCount} (-${memberDropPct}%), events went from ${previous.eventCount} to ${current.eventCount}.`,
          fallbackMsg
        );
        message = text;

        if (mode === 'supabase') {
          const supabase = await createServerSupabaseClient();
          if (supabase) {
            await supabase.from('ai_recommendations').insert({
              type: 'club_revival',
              club_id: club.id,
              title: `Declining Activity Signal: ${club.name} (-${memberDropPct}% Active Members)`,
              summary: message,
              explanation: `Compared ${previous.periodLabel} (${previous.eventCount} events, ${previous.activeMembersCount} active) vs ${current.periodLabel} (${current.eventCount} events, ${current.activeMembersCount} active).`,
              payload: { revivalSuggestions },
              source_records: [club.id, previous.periodLabel, current.periodLabel],
              confidence_score: 0.88,
              priority: 'high',
              status: 'pending_review',
              created_by_agent: 'Volunteer & Club Health Agent',
            });
          }
        }
      }

      return {
        clubId: club.id,
        clubName: club.name,
        status: isDeclining
          ? ('declining_activity' as const)
          : ('healthy' as const),
        periodsAnalyzed: periods.length,
        previousPeriod: previous,
        currentPeriod: current,
        memberDropPct,
        message,
        revivalSuggestions,
      };
    })
  );

  return NextResponse.json({ assessments });
}
