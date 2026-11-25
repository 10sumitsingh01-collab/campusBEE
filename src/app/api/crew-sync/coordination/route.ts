import { NextRequest, NextResponse } from 'next/server';
import {
  detectAudienceClashes,
  detectVenueClashes,
} from '@/lib/coordination/clashCheck';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AIRecommendation, CampusEvent, Club, Venue } from '@/types/domain';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const mode = getDataMode();
  let events: CampusEvent[] = [];
  let clubs: Club[] = [];
  let venues: Venue[] = [];

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const [eventsRes, clubsRes, venuesRes] = await Promise.all([
      supabase.from('events').select('*'),
      supabase.from('clubs').select('*'),
      supabase.from('venues').select('*'),
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

    venues = (venuesRes.data ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      building: v.building,
      capacity: v.capacity,
      equipment: v.equipment ?? [],
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
      submissionDeadline: e.submission_deadline ?? undefined,
      startTime: e.start_time,
      endTime: e.end_time,
      setupBufferMinutes: e.setup_buffer_minutes,
      teardownBufferMinutes: e.teardown_buffer_minutes,
      venueId: e.venue_id ?? '',
      status: e.status,
      registrationsCount: 0,
    }));

    // Also invoke PostgreSQL RPC detect_venue_clashes on active events for DB-level verification
    for (const ev of events.filter(
      (e) => e.venueId && ['published', 'ongoing', 'pending_approval'].includes(e.status)
    )) {
      await supabase.rpc('detect_venue_clashes', {
        p_event_id: ev.id,
        p_venue_id: ev.venueId,
        p_start_time: ev.startTime,
        p_end_time: ev.endTime,
        p_setup_minutes: ev.setupBufferMinutes,
        p_teardown_minutes: ev.teardownBufferMinutes,
      });
    }
  } else {
    const store = getStore();
    events = store.events;
    clubs = store.clubs;
    venues = store.venues;
  }

  const venueClashes = detectVenueClashes(events, venues);
  const audienceClashes = detectAudienceClashes(events);

  const createdRecommendations: AIRecommendation[] = venueClashes.map((c) => {
    const clubA = clubs.find((cl) => cl.id === c.eventA.clubId)?.name ?? c.eventA.clubId;
    const clubB = clubs.find((cl) => cl.id === c.eventB.clubId)?.name ?? c.eventB.clubId;
    const altNames = c.alternateVenues.map((v) => `${v.name} (cap ${v.capacity})`);
    const slotLabels = c.alternateTimeSlots.map((s) => s.label);

    return {
      id: generateId('rec'),
      type: 'clash_resolution',
      eventId: c.eventB.id,
      clubId: c.eventB.clubId,
      title: `Hard Venue Clash: ${c.venue.name}`,
      summary: `${c.eventB.title} (${clubB}) overlaps with ${c.eventA.title} (${clubA}) at ${c.venue.name}.`,
      explanation: `Deterministic overlap check (including setup/teardown buffers) flagged ${c.overlapStart} to ${c.overlapEnd}. Alternate venues: ${altNames.join(', ') || 'none'}. Alternate slots: ${slotLabels.join(', ') || 'none'}.`,
      sourceRecords: [c.eventA.id, c.eventB.id, c.venue.id],
      confidenceScore: 1.0,
      priority: 'critical',
      status: 'pending_review',
      createdByAgent: 'Event Coordination Agent',
      suggestedActionLabel: altNames[0] ? `Move to ${altNames[0]}` : undefined,
      createdAt: new Date().toISOString(),
    };
  });

  if (mode === 'supabase' && createdRecommendations.length > 0) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      await supabase.from('ai_recommendations').insert(
        createdRecommendations.map((r, idx) => ({
          type: r.type,
          event_id: r.eventId ?? null,
          club_id: r.clubId ?? null,
          title: r.title,
          summary: r.summary,
          explanation: r.explanation,
          payload: {
            suggestedVenueId: venueClashes[idx]?.alternateVenues[0]?.id ?? null,
            alternateVenues: venueClashes[idx]?.alternateVenues ?? [],
            alternateTimeSlots: venueClashes[idx]?.alternateTimeSlots ?? [],
          },
          source_records: r.sourceRecords,
          confidence_score: r.confidenceScore,
          priority: r.priority,
          status: 'pending_review',
          created_by_agent: r.createdByAgent,
        }))
      );
    }
  } else if (mode === 'local_seed') {
    const store = getStore();
    for (const r of createdRecommendations) {
      if (!store.recommendations.some((ex) => ex.title === r.title && ex.eventId === r.eventId)) {
        store.recommendations.unshift(r);
      }
    }
  }

  return NextResponse.json({
    venueClashes,
    audienceClashes,
    recommendations: createdRecommendations,
  });
}
