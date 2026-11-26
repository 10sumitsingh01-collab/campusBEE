import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getDataMode, getStore, saveDemoStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkCandidateEventClashes } from '@/lib/coordination/clashCheck';
import { RecommendationStatus } from '@/types/domain';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: RecommendationStatus;
    summary?: string;
    applyVenueId?: string;
    expectedPlan?: { venueId?: string; startTime?: string; endTime?: string };
  };

  if (
    !body.status ||
    !['accepted', 'edited', 'dismissed'].includes(body.status)
  ) {
    return NextResponse.json(
      { error: 'status must be accepted, edited, or dismissed.' },
      { status: 400 }
    );
  }

  const reviewedAt = new Date().toISOString();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: existing } = await supabase
      .from('ai_recommendations')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: 'Recommendation not found.' },
        { status: 404 }
      );
    }

    const { data: updated, error } = await supabase
      .from('ai_recommendations')
      .update({
        status: body.status,
        summary: body.summary ?? existing.summary,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Human-in-the-loop: only apply venue change AFTER explicit approval
    const targetVenueId =
      body.applyVenueId ?? existing.payload?.suggestedVenueId;
    if (
      body.status === 'accepted' &&
      existing.type === 'clash_resolution' &&
      existing.event_id &&
      targetVenueId
    ) {
      await supabase
        .from('events')
        .update({ venue_id: targetVenueId })
        .eq('id', existing.event_id);
    }

    return NextResponse.json({
      recommendation: {
        id: updated.id,
        type: updated.type,
        eventId: updated.event_id ?? undefined,
        clubId: updated.club_id ?? undefined,
        title: updated.title,
        summary: updated.summary,
        explanation: updated.explanation,
        sourceRecords: updated.source_records ?? [],
        confidenceScore: Number(updated.confidence_score ?? 0.8),
        priority: updated.priority,
        status: updated.status,
        createdByAgent: updated.created_by_agent,
        createdAt: updated.created_at,
      },
      audit: {
        reviewedBy: user.id,
        reviewedAt,
      },
    });
  }

  const store = getStore();
  const idx = store.recommendations.findIndex((r) => r.id === id);
  if (idx === -1) {
    return NextResponse.json(
      { error: 'Recommendation not found.' },
      { status: 404 }
    );
  }

  const rec = store.recommendations[idx];
  if (rec.clubId && !canManageClub(user, rec.clubId)) return forbiddenResponse();
  if (rec.type === 'clash_resolution' && body.status === 'accepted' && rec.status !== 'accepted') {
    const event = store.events.find(e => e.id === rec.eventId);
    if (!event || !canManageClub(user, event.clubId)) return forbiddenResponse();
    const conflict = checkCandidateEventClashes(event, store.events, store.venues).find(c =>
      rec.sourceRecords.includes(c.eventA.id) && rec.sourceRecords.includes(c.venue.id));
    const plan = rec.scheduleChange;
    const expected = body.expectedPlan;
    if (expected && plan && ('venueId' in plan ? expected.venueId !== plan.venueId :
      expected.startTime !== plan.startTime || expected.endTime !== plan.endTime)) {
      return NextResponse.json({ error: 'The proposed plan changed. Review the latest suggestion.' }, { status: 409 });
    }
    const valid = plan && conflict && ('venueId' in plan
      ? conflict.alternateVenues.some(v => v.id === plan.venueId)
      : conflict.alternateTimeSlots.some(s => s.startTime === plan.startTime && s.endTime === plan.endTime));
    if (!valid) {
      return NextResponse.json({ error: 'This plan is no longer available. Scan for a current alternative.' }, { status: 409 });
    }
    Object.assign(event, plan);
  }
  store.recommendations[idx] = {
    ...store.recommendations[idx],
    status: body.status,
    summary: body.summary ?? store.recommendations[idx].summary,
  };

  saveDemoStore(store);
  return NextResponse.json({
    recommendation: store.recommendations[idx],
    audit: {
      reviewedBy: user.id,
      reviewedAt,
    },
  });
}
