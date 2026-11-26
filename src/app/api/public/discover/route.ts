import { connection, NextResponse } from 'next/server';
import { SEED_CLUBS, SEED_EVENTS, SEED_VENUES } from '@/lib/data/seed';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  await connection();
  const mode = getDataMode();

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const [clubsRes, venuesRes, eventsRes] = await Promise.all([
        supabase.from('clubs').select('*').eq('status', 'active').order('name'),
        supabase.from('venues').select('*').order('name'),
        supabase
          .from('events')
          .select('*')
          .in('status', ['published', 'ongoing'])
          .order('start_time'),
      ]);

      if (
        (eventsRes.data && eventsRes.data.length > 0) ||
        (clubsRes.data && clubsRes.data.length > 0)
      ) {
        return NextResponse.json({
          clubs: (clubsRes.data ?? []).map((c) => ({
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
          })),
          venues: (venuesRes.data ?? []).map((v) => ({
            id: v.id,
            name: v.name,
            building: v.building,
            capacity: v.capacity,
            equipment: v.equipment ?? [],
          })),
          events: (eventsRes.data ?? []).map((e) => ({
            id: e.id,
            clubId: e.club_id,
            title: e.title,
            description: e.description ?? '',
            eventType: e.event_type,
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
          })),
        });
      }
    }

    // When RLS blocks anonymous reads before login, serve public catalog preview
    return NextResponse.json({
      clubs: SEED_CLUBS,
      venues: SEED_VENUES,
      events: SEED_EVENTS.filter((e) => e.status === 'published'),
    });
  }

  const store = getStore();
  return NextResponse.json({
    clubs: store.clubs.filter(c => c.status === 'active'),
    venues: store.venues,
    events: store.events.filter(e => e.status === 'published' || e.status === 'ongoing'),
  });
}
