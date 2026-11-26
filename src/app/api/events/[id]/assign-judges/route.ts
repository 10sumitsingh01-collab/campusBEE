import { saveDemoStore } from '@/lib/server/store';
import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { JudgeAssignment } from '@/types/domain';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id: eventId } = await context.params;
  const body = (await request.json()) as {
    judgeId?: string;
    submissionId?: string;
  };
  if (!body.judgeId || !body.submissionId) {
    return NextResponse.json(
      { error: 'judgeId and submissionId are required.' },
      { status: 400 }
    );
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data, error } = await supabase
      .from('judge_assignments')
      .upsert(
        {
          event_id: eventId,
          judge_id: body.judgeId,
          submission_id: body.submissionId,
        },
        { onConflict: 'judge_id,submission_id' }
      )
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Unable to assign judge.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        assignment: {
          id: data.id,
          eventId: data.event_id,
          judgeId: data.judge_id,
          submissionId: data.submission_id,
          assignedAt: data.assigned_at,
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

  if (!canManageClub(user, event.clubId)) {
    return forbiddenResponse('Only the club organizer or admin can assign judges.');
  }

  if (!store.accounts.some(a => a.profile.role === 'judge' && a.profile.id === body.judgeId) || !store.submissions.some(s => s.id === body.submissionId && s.eventId === eventId)) {
    return NextResponse.json({ error: 'Select a judge and a submission belonging to this event.' }, { status: 400 });
  }
  const existing = store.judgeAssignments.find(
    (ja) =>
      ja.judgeId === body.judgeId && ja.submissionId === body.submissionId
  );
  if (existing) {
    return NextResponse.json({ assignment: existing });
  }

  const assignment: JudgeAssignment = {
    id: generateId('ja'),
    eventId,
    judgeId: body.judgeId,
    submissionId: body.submissionId,
    assignedAt: new Date().toISOString(),
  };

  store.judgeAssignments.push(assignment);
  saveDemoStore(store);
  return NextResponse.json({ assignment }, { status: 201 });
}


export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();
  if (user.role !== 'college_admin' && user.role !== 'club_organizer') return forbiddenResponse();
  if (getDataMode() === 'supabase') {
    const client = await createServerSupabaseClient();
    if (!client) return unauthorizedResponse();
    const { data, error } = await client.from('users').select('id,name,email').eq('role','judge');
    return error ? NextResponse.json({ error: error.message }, { status: 403 }) : NextResponse.json({ judges: data });
  }
  const { id } = await context.params;
  const store = getStore();
  const event = store.events.find(e => e.id === id);
  if (!event || !canManageClub(user, event.clubId)) return forbiddenResponse();
  const judges = store.accounts.filter(a => a.profile.role === 'judge')
    .map(({ profile: { id, name, email } }) => ({ id, name, email }));
  return NextResponse.json({ judges });
}
