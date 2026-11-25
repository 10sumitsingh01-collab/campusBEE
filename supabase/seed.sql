-- =============================================================================
-- CampusOS + Crew Sync AI: Idempotent Demo Seed Data
-- =============================================================================
-- Safe to rerun: Uses ON CONFLICT DO NOTHING and does NOT grant college_admin
-- privileges to any user.
-- Run AFTER 0001_initial_schema.sql.
-- =============================================================================

-- 1. Seed Campus Venues (always safe, no auth.users dependency)
insert into public.venues (id, name, building, capacity, equipment) values
  ('11111111-1111-1111-1111-111111111101', 'Main Auditorium', 'Central Academic Block', 400, array['projector', 'stage_audio', 'livestream_rig', 'high_speed_wifi']),
  ('11111111-1111-1111-1111-111111111102', 'Design Lab', 'Innovation Wing 2F', 80, array['workstations', 'whiteboards', '4k_display']),
  ('11111111-1111-1111-1111-111111111103', 'Seminar Hall B', 'Engineering Block 1F', 150, array['projector', 'podium_mic', 'power_strips']),
  ('11111111-1111-1111-1111-111111111104', 'Maker Studio', 'Robotics & Hardware Wing', 60, array['soldering_stations', '3d_printers', 'oscilloscopes'])
on conflict (id) do nothing;

-- 2. Seed Sample Clubs, Events, Metrics & Recommendations
--    Only seeds user-owned rows if at least one user exists in public.users
--    (or creates a profile from auth.users with role = 'club_organizer', NEVER 'college_admin').
do $$
declare
  v_owner_id uuid;
begin
  select id into v_owner_id from public.users order by created_at asc limit 1;

  if v_owner_id is null then
    select id into v_owner_id from auth.users order by created_at asc limit 1;
    if v_owner_id is not null then
      insert into public.users (id, name, email, department, year, role)
      select
        au.id,
        coalesce(au.raw_user_meta_data ->> 'name', split_part(au.email, '@', 1)),
        au.email,
        coalesce(au.raw_user_meta_data ->> 'department', 'Computer Science'),
        3,
        'club_organizer'::public.user_role
      from auth.users au
      where au.id = v_owner_id
      on conflict (id) do nothing;
    end if;
  end if;

  if v_owner_id is null then
    raise notice 'No auth.users found yet; venues seeded. Sign up a user first and rerun seed.sql to populate sample clubs and events.';
    return;
  end if;

  -- Clubs (auto_add_club_owner trigger adds v_owner_id as 'owner' in club_members)
  insert into public.clubs (id, name, slug, description, category, interests, capabilities, status, owner_id) values
    ('22222222-2222-2222-2222-222222222201', 'Coding Club', 'coding-club', 'Building software, hosting hackathons, and mentoring peer developers.', 'Technical', array['AI/ML', 'Web Engineering', 'Hackathons'], array['Full-Stack Mentorship', 'Judging Pipelines', 'Cloud Credits'], 'active', v_owner_id),
    ('22222222-2222-2222-2222-222222222202', 'Robotics Club', 'robotics-club', 'Autonomous systems, embedded hardware, ROS, and mechatronics prototyping.', 'Hardware & Engineering', array['Robotics', 'Embedded Systems', 'AI'], array['Hardware Kits', 'Soldering & Fabrication', 'ROS Workshops'], 'active', v_owner_id),
    ('22222222-2222-2222-2222-222222222203', 'Design Club', 'design-club', 'UI/UX craft, design systems, and visual storytelling for campus initiatives.', 'Design & Media', array['UI/UX', 'Product Design', 'Prototyping'], array['Figma Systems', 'Usability Critiques', 'Event Branding'], 'active', v_owner_id)
  on conflict (id) do nothing;

  -- Sample Events (includes the Nov 28 Main Auditorium clash scenario from Blueprint Section 10)
  insert into public.events (
    id, club_id, title, description, event_type, tags,
    eligibility_departments, eligibility_years, min_team_size, max_team_size,
    registration_deadline, submission_deadline, start_time, end_time,
    setup_buffer_minutes, teardown_buffer_minutes, venue_id, status, created_by
  ) values
    (
      '33333333-3333-3333-3333-333333333301',
      '22222222-2222-2222-2222-222222222201',
      'AI Hackathon',
      'A 6-hour sprint building practical campus AI solutions with mentors and rubric judging.',
      'Hackathon',
      array['AI', 'Full-Stack', 'Hackathon', 'Frontend'],
      array['All Departments'],
      array[1, 2, 3, 4],
      2, 4,
      '2026-11-27T23:59:00+05:30',
      '2026-11-28T15:30:00+05:30',
      '2026-11-28T10:00:00+05:30',
      '2026-11-28T16:00:00+05:30',
      30, 30,
      '11111111-1111-1111-1111-111111111101',
      'published',
      v_owner_id
    ),
    (
      '33333333-3333-3333-3333-333333333302',
      '22222222-2222-2222-2222-222222222202',
      'Robotics Workshop',
      'Hands-on microcontroller and autonomous navigation workshop.',
      'Workshop',
      array['Robotics', 'Hardware', 'Embedded', 'AI'],
      array['CSE', 'ECE', 'ME', 'EEE'],
      array[1, 2, 3],
      1, 2,
      '2026-11-27T20:00:00+05:30',
      null,
      '2026-11-28T12:00:00+05:30',
      '2026-11-28T15:00:00+05:30',
      30, 30,
      '11111111-1111-1111-1111-111111111101',
      'published',
      v_owner_id
    ),
    (
      '33333333-3333-3333-3333-333333333303',
      '22222222-2222-2222-2222-222222222203',
      'UI/UX Workshop',
      'Interactive Figma prototyping and rapid product critique session.',
      'Workshop',
      array['UI/UX', 'Design', 'Figma', 'Product'],
      array['All Departments'],
      array[1, 2, 3, 4],
      1, 1,
      '2026-11-29T23:59:00+05:30',
      null,
      '2026-11-30T14:00:00+05:30',
      '2026-11-30T16:00:00+05:30',
      15, 15,
      '11111111-1111-1111-1111-111111111102',
      'published',
      v_owner_id
    )
  on conflict (id) do nothing;

  -- Sample Club Activity Metrics (2 periods for Robotics Club to demonstrate trend detection)
  insert into public.club_activity_metrics (
    club_id, period_start, period_end, event_count, registrations_count, attendance_count, active_members_count, volunteer_participation_count
  ) values
    ('22222222-2222-2222-2222-222222222201', '2026-10-01', '2026-11-25', 5, 380, 312, 118, 44),
    ('22222222-2222-2222-2222-222222222202', '2026-08-01', '2026-09-30', 3, 145, 110, 49, 18),
    ('22222222-2222-2222-2222-222222222202', '2026-10-01', '2026-11-25', 1, 34, 19, 22, 5),
    ('22222222-2222-2222-2222-222222222203', '2026-10-01', '2026-11-25', 4, 210, 178, 76, 29)
  on conflict (club_id, period_start, period_end) do nothing;
end
$$;
