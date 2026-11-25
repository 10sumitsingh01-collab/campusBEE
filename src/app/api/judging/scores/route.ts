import { NextRequest, NextResponse } from 'next/server';
import {
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ScoreEntry } from '@/types/domain';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['judge', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json()) as {
    judgeAssignmentId?: string;
    unlock?: boolean;
    scores?: { criterionId: string; score: number; feedback?: string }[];
  };

  if (!body.judgeAssignmentId) {
    return NextResponse.json(
      { error: 'judgeAssignmentId is required.' },
      { status: 400 }
    );
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: assignment } = await supabase
      .from('judge_assignments')
      .select('*')
      .eq('id', body.judgeAssignmentId)
      .single();

    if (!assignment) {
      return NextResponse.json(
        { error: 'Judge assignment not found.' },
        { status: 404 }
      );
    }

    if (body.unlock) {
      if (user.role !== 'college_admin') {
        return forbiddenResponse(
          'Only a college admin can unlock submitted scores.'
        );
      }
      await supabase
        .from('scores')
        .update({ locked: false })
        .eq('judge_assignment_id', assignment.id);
      return NextResponse.json({ unlocked: true });
    }

    if (user.role === 'judge' && assignment.judge_id !== user.id) {
      return forbiddenResponse(
        'You can only score your own assigned submissions.'
      );
    }

    const { data: existingScores } = await supabase
      .from('scores')
      .select('id, locked')
      .eq('judge_assignment_id', assignment.id);

    if ((existingScores ?? []).some((s) => s.locked)) {
      return NextResponse.json(
        { error: 'Scores are locked. Ask a college admin to unlock edits.' },
        { status: 409 }
      );
    }

    if (!body.scores?.length) {
      return NextResponse.json(
        { error: 'scores array is required.' },
        { status: 400 }
      );
    }

    const { data: criteria } = await supabase
      .from('rubric_criteria')
      .select('id, max_score')
      .eq('event_id', assignment.event_id);

    const critMap = new Map(
      (criteria ?? []).map((c) => [c.id, Number(c.max_score)])
    );

    const rows = [];
    for (const item of body.scores) {
      const maxScore = critMap.get(item.criterionId);
      if (maxScore === undefined || item.score < 0 || item.score > maxScore) {
        return NextResponse.json(
          {
            error: `Invalid score for criterion ${item.criterionId} (must be 0..${maxScore ?? '?'}).`,
          },
          { status: 400 }
        );
      }
      rows.push({
        event_id: assignment.event_id,
        judge_assignment_id: assignment.id,
        criterion_id: item.criterionId,
        score: item.score,
        feedback: item.feedback?.trim() ?? '',
        locked: true,
        submitted_at: new Date().toISOString(),
      });
    }

    const { data: saved, error } = await supabase
      .from('scores')
      .upsert(rows, { onConflict: 'judge_assignment_id,criterion_id' })
      .select('*');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ scores: saved ?? [] }, { status: 201 });
  }

  const store = getStore();
  const assignment = store.judgeAssignments.find(
    (ja) => ja.id === body.judgeAssignmentId
  );
  if (!assignment) {
    return NextResponse.json(
      { error: 'Judge assignment not found.' },
      { status: 404 }
    );
  }

  if (body.unlock) {
    if (user.role !== 'college_admin') {
      return forbiddenResponse('Only a college admin can unlock submitted scores.');
    }
    store.scores = store.scores.map((s) =>
      s.judgeAssignmentId === assignment.id ? { ...s, locked: false } : s
    );
    return NextResponse.json({ unlocked: true });
  }

  if (user.role === 'judge' && assignment.judgeId !== user.id) {
    return forbiddenResponse('You can only score your own assigned submissions.');
  }

  const alreadyLocked = store.scores.some(
    (s) => s.judgeAssignmentId === assignment.id && s.locked
  );
  if (alreadyLocked) {
    return NextResponse.json(
      { error: 'Scores are locked. Ask a college admin to unlock edits.' },
      { status: 409 }
    );
  }

  if (!body.scores?.length) {
    return NextResponse.json(
      { error: 'scores array is required.' },
      { status: 400 }
    );
  }

  const saved: ScoreEntry[] = [];
  for (const item of body.scores) {
    const criterion = store.rubrics.find((r) => r.id === item.criterionId);
    if (!criterion || item.score < 0 || item.score > criterion.maxScore) {
      return NextResponse.json(
        {
          error: `Invalid score for criterion ${item.criterionId} (must be 0..${criterion?.maxScore ?? '?'}).`,
        },
        { status: 400 }
      );
    }

    const entry: ScoreEntry = {
      id: generateId('scr'),
      judgeAssignmentId: assignment.id,
      criterionId: item.criterionId,
      score: item.score,
      feedback: item.feedback?.trim() ?? '',
      locked: true,
      submittedAt: new Date().toISOString(),
    };
    saved.push(entry);
  }

  store.scores = [
    ...store.scores.filter((s) => s.judgeAssignmentId !== assignment.id),
    ...saved,
  ];

  return NextResponse.json({ scores: saved }, { status: 201 });
}
