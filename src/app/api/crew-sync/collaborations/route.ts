import { NextRequest, NextResponse } from 'next/server';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateGroundedNarrative } from '@/lib/server/gemini';
import { generateId, getDataMode, getStore, saveDemoStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AIRecommendation, CampusEvent, Club } from '@/types/domain';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as {
    clubId?: string;
    eventId?: string;
  };

  const mode = getDataMode();
  let clubs: Club[] = [];
  let events: CampusEvent[] = [];

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const [clubsRes, eventsRes] = await Promise.all([
      supabase.from('clubs').select('*').eq('status', 'active'),
      supabase.from('events').select('*'),
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

    events = (eventsRes.data ?? []).map((e) => ({
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
      startTime: e.start_time,
      endTime: e.end_time,
      setupBufferMinutes: e.setup_buffer_minutes,
      teardownBufferMinutes: e.teardown_buffer_minutes,
      venueId: e.venue_id ?? '',
      status: e.status,
      registrationsCount: 0,
    }));
  } else {
    const store = getStore();
    clubs = store.clubs;
    events = store.events;
  }

  const primaryClub = clubs.find((c) => c.id === body.clubId) ?? clubs[0];
  if (!primaryClub) {
    return NextResponse.json({ error: 'Club not found.' }, { status: 404 });
  }

  const event = body.eventId
    ? events.find((e) => e.id === body.eventId)
    : events.find((e) => e.clubId === primaryClub.id);

  const candidates = clubs
    .filter((c) => c.id !== primaryClub.id && c.status === 'active')
    .map((partner) => {
      const sharedInterests = partner.interests.filter((i) =>
        primaryClub.interests.some((pi) => pi.toLowerCase() === i.toLowerCase())
      );
      const complementary = partner.capabilities.filter(
        (cap) => !primaryClub.capabilities.includes(cap)
      );
      const score = sharedInterests.length * 2 + complementary.length;

      return { partner, sharedInterests, complementary, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = candidates[0];
  if (!top) {
    return NextResponse.json({ rankedPartners: [], recommendation: null });
  }

  const fallbackText = `${primaryClub.name} and ${top.partner.name} can co-host "${event?.title ?? 'Joint Campus Workshop'}" combining ${primaryClub.capabilities.slice(0, 2).join(' & ')} with ${top.partner.capabilities.slice(0, 2).join(' & ')}.`;

  const { text: proposal, usedGemini } = await generateGroundedNarrative(
    `Suggest a concise 2-sentence joint college event collaboration between ${primaryClub.name} (capabilities: ${primaryClub.capabilities.join(', ')}) and ${top.partner.name} (capabilities: ${top.partner.capabilities.join(', ')}). Shared themes: ${top.sharedInterests.join(', ') || 'interdisciplinary innovation'}.`,
    fallbackText
  );

  let rec: AIRecommendation = {
    id: generateId('rec'),
    type: 'club_collaboration',
    eventId: event?.id,
    clubId: primaryClub.id,
    title: `Collaborate with ${top.partner.name}`,
    summary: proposal,
    explanation: `Matched on ${top.sharedInterests.length} shared theme(s) (${top.sharedInterests.join(', ') || 'complementary audience'}) and ${top.complementary.length} complementary capabilities (${top.complementary.join(', ')}).`,
    sourceRecords: [primaryClub.id, top.partner.id, ...(event ? [event.id] : [])],
    confidenceScore: 0.89,
    priority: 'high',
    status: 'pending_review',
    createdByAgent: 'Club Collaboration Agent',
    suggestedActionLabel: `Propose Joint Role Split with ${top.partner.name}`,
    createdAt: new Date().toISOString(),
  };

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data: inserted } = await supabase
        .from('ai_recommendations')
        .insert({
          type: rec.type,
          event_id: rec.eventId ?? null,
          club_id: rec.clubId ?? null,
          title: rec.title,
          summary: rec.summary,
          explanation: rec.explanation,
          payload: {
            partnerClubId: top.partner.id,
            partnerClubName: top.partner.name,
            sharedInterests: top.sharedInterests,
          },
          source_records: rec.sourceRecords,
          confidence_score: rec.confidenceScore,
          priority: rec.priority,
          status: 'pending_review',
          created_by_agent: rec.createdByAgent,
        })
        .select('id, created_at')
        .single();

      if (inserted) {
        rec = { ...rec, id: inserted.id, createdAt: inserted.created_at };
      }
    }
  } else {
    const store = getStore();
    store.recommendations.unshift(rec);
    saveDemoStore(store);
  }

  return NextResponse.json({
    usedGemini,
    rankedPartners: candidates.map((c) => ({
      clubId: c.partner.id,
      clubName: c.partner.name,
      sharedInterests: c.sharedInterests,
      complementaryCapabilities: c.complementary,
      matchScore: c.score,
    })),
    recommendation: rec,
  });
}
