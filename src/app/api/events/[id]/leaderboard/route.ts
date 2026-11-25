import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '@/lib/server/authGuard';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    const [critRes, subRes, teamRes, assignRes, scoreRes] = await Promise.all([
      supabase.from('rubric_criteria').select('*').eq('event_id', eventId),
      supabase.from('submissions').select('*').eq('event_id', eventId),
      supabase.from('teams').select('id, name').eq('event_id', eventId),
      supabase.from('judge_assignments').select('*').eq('event_id', eventId),
      supabase.from('scores').select('*').eq('event_id', eventId),
    ]);

    const criteria = critRes.data ?? [];
    const submissions = subRes.data ?? [];
    const teams = teamRes.data ?? [];
    const assignments = assignRes.data ?? [];
    const scores = scoreRes.data ?? [];

    const maxWeighted = criteria.reduce(
      (sum, c) => sum + Number(c.max_score) * Number(c.weight),
      0
    );

    const entries = submissions.map((sub) => {
      const team = teams.find((t) => t.id === sub.team_id);
      const subAssignments = assignments.filter(
        (ja) => ja.submission_id === sub.id
      );

      const judgeTotals = subAssignments.map((ja) => {
        const jaScores = scores.filter(
          (sc) => sc.judge_assignment_id === ja.id
        );
        return jaScores.reduce((sum, sc) => {
          const crit = criteria.find((c) => c.id === sc.criterion_id);
          return sum + Number(sc.score) * Number(crit?.weight ?? 1);
        }, 0);
      });

      const averageWeightedScore =
        judgeTotals.length > 0
          ? Number(
              (
                judgeTotals.reduce((a, b) => a + b, 0) / judgeTotals.length
              ).toFixed(2)
            )
          : 0;

      return {
        submissionId: sub.id,
        submissionTitle: sub.title,
        teamId: sub.team_id,
        teamName: team?.name ?? 'Unknown Team',
        judgeCount: judgeTotals.length,
        averageWeightedScore,
        maxPossibleWeightedScore: maxWeighted,
      };
    });

    entries.sort((a, b) => b.averageWeightedScore - a.averageWeightedScore);
    return NextResponse.json({
      leaderboard: entries.map((e, idx) => ({ rank: idx + 1, ...e })),
    });
  }

  const store = getStore();
  const criteria = store.rubrics.filter((r) => r.eventId === eventId);
  const submissions = store.submissions.filter((s) => s.eventId === eventId);

  const maxWeighted = criteria.reduce(
    (sum, c) => sum + c.maxScore * c.weight,
    0
  );

  const entries = submissions.map((sub) => {
    const team = store.teams.find((t) => t.id === sub.teamId);
    const assignments = store.judgeAssignments.filter(
      (ja) => ja.submissionId === sub.id
    );

    const judgeTotals = assignments.map((ja) => {
      const jaScores = store.scores.filter(
        (sc) => sc.judgeAssignmentId === ja.id
      );
      return jaScores.reduce((sum, sc) => {
        const crit = criteria.find((c) => c.id === sc.criterionId);
        return sum + sc.score * (crit?.weight ?? 1);
      }, 0);
    });

    const averageWeightedScore =
      judgeTotals.length > 0
        ? Number(
            (
              judgeTotals.reduce((a, b) => a + b, 0) / judgeTotals.length
            ).toFixed(2)
          )
        : 0;

    return {
      submissionId: sub.id,
      submissionTitle: sub.title,
      teamId: sub.teamId,
      teamName: team?.name ?? 'Unknown Team',
      judgeCount: judgeTotals.length,
      averageWeightedScore,
      maxPossibleWeightedScore: maxWeighted,
    };
  });

  entries.sort((a, b) => b.averageWeightedScore - a.averageWeightedScore);
  const ranked = entries.map((entry, idx) => ({
    rank: idx + 1,
    ...entry,
  }));

  return NextResponse.json({ leaderboard: ranked });
}
