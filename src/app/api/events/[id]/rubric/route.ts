import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { RubricCriterion } from '@/types/domain';

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

    const { data, error } = await supabase
      .from('rubric_criteria')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const criteria: RubricCriterion[] = (data ?? []).map((r) => ({
      id: r.id,
      eventId: r.event_id,
      name: r.name,
      description: r.description ?? '',
      maxScore: Number(r.max_score),
      weight: Number(r.weight),
      sortOrder: r.sort_order,
    }));

    return NextResponse.json({ criteria });
  }

  const criteria = getStore()
    .rubrics.filter((r) => r.eventId === eventId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return NextResponse.json({ criteria });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id: eventId } = await context.params;
  const body = (await request.json()) as {
    criteria?: Partial<RubricCriterion>[];
  };
  if (!body.criteria?.length) {
    return NextResponse.json(
      { error: 'At least one rubric criterion is required.' },
      { status: 400 }
    );
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    await supabase.from('rubric_criteria').delete().eq('event_id', eventId);

    const rows = body.criteria.map((c, idx) => ({
      event_id: eventId,
      name: c.name?.trim() || `Criterion ${idx + 1}`,
      description: c.description?.trim() ?? '',
      max_score: c.maxScore && c.maxScore > 0 ? c.maxScore : 10,
      weight: c.weight && c.weight > 0 ? c.weight : 1.0,
      sort_order: c.sortOrder ?? idx + 1,
    }));

    const { data, error } = await supabase
      .from('rubric_criteria')
      .insert(rows)
      .select('*');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ criteria: data ?? [] }, { status: 201 });
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  if (!canManageClub(user, event.clubId)) {
    return forbiddenResponse('Only the club organizer or admin can edit rubrics.');
  }

  const created: RubricCriterion[] = body.criteria.map((c, idx) => ({
    id: generateId('rub'),
    eventId,
    name: c.name?.trim() || `Criterion ${idx + 1}`,
    description: c.description?.trim() ?? '',
    maxScore: c.maxScore && c.maxScore > 0 ? c.maxScore : 10,
    weight: c.weight && c.weight > 0 ? c.weight : 1.0,
    sortOrder: c.sortOrder ?? idx + 1,
  }));

  store.rubrics = [
    ...store.rubrics.filter((r) => r.eventId !== eventId),
    ...created,
  ];

  return NextResponse.json({ criteria: created }, { status: 201 });
}
