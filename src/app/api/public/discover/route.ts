import { connection, NextResponse } from 'next/server';
import { getDataMode, getStore } from '@/lib/server/store';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  await connection();
  const mode = getDataMode();

  if (mode === 'supabase') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      // Fixed public projection. RLS on direct database clients stays in effect.
      const supabase = createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}});
      const [clubsRes, venuesRes, eventsRes] = await Promise.all([
        supabase.from('clubs').select('id,name,slug,description,category,interests,capabilities,status').eq('status', 'active').order('name'),
        supabase.from('venues').select('id,name,building,capacity,equipment').order('name'),
        supabase
          .from('events')
          .select('id,club_id,title,description,event_type,tags,eligibility_departments,eligibility_years,min_team_size,max_team_size,registration_deadline,submission_deadline,start_time,end_time,setup_buffer_minutes,teardown_buffer_minutes,venue_id,status')
          .in('status', ['published', 'ongoing'])
          .order('start_time'),
      ]);

      if (!eventsRes.error && !clubsRes.error && !venuesRes.error) {
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

    return NextResponse.json({ error: 'Campus catalog unavailable.' }, { status: 503 });
  }

  const store = getStore();
  return NextResponse.json({
    clubs: store.clubs.filter(c => c.status === 'active'),
    venues: store.venues,
    events: store.events.filter(e => e.status === 'published' || e.status === 'ongoing'),
  });
}
