-- =============================================================================
-- CampusOS + Crew Sync AI: Initial PostgreSQL & Supabase Schema
-- =============================================================================
-- Execution Notes:
--   - Designed for a FRESH Supabase PostgreSQL project (run once as initial migration).
--   - Not idempotent for DDL (`CREATE TYPE` / `CREATE TABLE` will error if rerun
--     on an already-initialized database; track via Supabase migrations).
--   - `supabase/seed.sql` IS idempotent (`ON CONFLICT DO NOTHING`) and safe to rerun.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('student', 'club_organizer', 'judge', 'college_admin');
create type public.event_status as enum ('draft', 'pending_approval', 'published', 'ongoing', 'completed', 'cancelled');
create type public.registration_status as enum ('registered', 'waitlisted', 'cancelled');
create type public.team_status as enum ('forming', 'locked', 'disqualified');
create type public.team_member_status as enum ('accepted', 'left');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type public.club_status as enum ('active', 'inactive', 'pending');
create type public.club_member_role as enum ('owner', 'lead', 'member');
create type public.volunteer_invite_status as enum ('invited', 'accepted', 'declined');
create type public.collaboration_status as enum ('draft', 'proposed', 'approved', 'rejected');
create type public.recommendation_type as enum (
  'clash_resolution',
  'club_collaboration',
  'volunteer_match',
  'club_revival',
  'event_report'
);
create type public.recommendation_status as enum ('draft', 'pending_review', 'accepted', 'edited', 'dismissed');
create type public.report_status as enum ('draft', 'approved', 'published');
create type public.budget_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.approval_entity_type as enum ('club', 'event', 'budget_request', 'collaboration', 'event_report');

-- -----------------------------------------------------------------------------
-- 2. SHARED TRIGGER HELPERS (Safe search_path)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. CORE PLATFORM TABLES
-- -----------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  roll_number text unique,
  department text,
  year integer check (year is null or (year >= 1 and year <= 6)),
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  role public.user_role not null default 'student',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text not null default '',
  category text not null,
  interests text[] not null default '{}',
  capabilities text[] not null default '{}',
  status public.club_status not null default 'pending',
  owner_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_clubs_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.club_member_role not null default 'member',
  membership_status text not null default 'active' check (membership_status in ('active', 'inactive')),
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);

-- Automatically add club owner as 'owner' in club_members when a club is created
create or replace function public.auto_add_club_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.club_members (club_id, user_id, role, membership_status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict (club_id, user_id)
  do update set role = 'owner', membership_status = 'active';
  return new;
end;
$$;

create trigger trg_clubs_auto_add_owner
  after insert on public.clubs
  for each row execute function public.auto_add_club_owner();

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  building text not null,
  capacity integer not null check (capacity > 0),
  equipment text[] not null default '{}',
  availability_constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_venues_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  description text not null default '',
  event_type text not null,
  rules text not null default '',
  tags text[] not null default '{}',
  eligibility_departments text[] not null default '{}',
  eligibility_years integer[] not null default '{}',
  min_team_size integer not null default 1 check (min_team_size >= 1),
  max_team_size integer not null default 4 check (max_team_size >= min_team_size),
  registration_deadline timestamptz not null,
  submission_deadline timestamptz,
  start_time timestamptz not null,
  end_time timestamptz not null,
  setup_buffer_minutes integer not null default 30 check (setup_buffer_minutes >= 0),
  teardown_buffer_minutes integer not null default 30 check (teardown_buffer_minutes >= 0),
  venue_id uuid references public.venues(id) on delete set null,
  status public.event_status not null default 'draft',
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  leader_id uuid not null references public.users(id) on delete restrict,
  status public.team_status not null default 'forming',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name),
  unique (id, event_id)
);

create trigger trg_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  team_id uuid,
  registration_type text not null default 'solo' check (registration_type in ('solo', 'team')),
  status public.registration_status not null default 'registered',
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  foreign key (team_id, event_id) references public.teams(id, event_id) on delete set null
);

create trigger trg_registrations_updated_at
  before update on public.registrations
  for each row execute function public.set_updated_at();

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  status public.team_member_status not null default 'accepted',
  joined_at timestamptz not null default now(),
  foreign key (team_id, event_id) references public.teams(id, event_id) on delete cascade
);

-- Enforce: A student can be an accepted member of only one team per event
create unique index unique_accepted_team_member_per_event
  on public.team_members (event_id, user_id)
  where status = 'accepted';

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  invited_user_id uuid references public.users(id) on delete cascade,
  invited_email text,
  invite_code text not null unique default encode(gen_random_bytes(8), 'hex'),
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (invited_user_id is not null or invited_email is not null),
  foreign key (team_id, event_id) references public.teams(id, event_id) on delete cascade
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null,
  title text not null,
  description text not null default '',
  links jsonb not null default '[]'::jsonb,
  file_urls text[] not null default '{}',
  submitted_by uuid not null references public.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, team_id),
  unique (id, event_id),
  foreign key (team_id, event_id) references public.teams(id, event_id) on delete cascade
);

create trigger trg_submissions_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text not null default '',
  max_score numeric(6,2) not null check (max_score > 0),
  weight numeric(5,2) not null default 1.0 check (weight > 0),
  sort_order integer not null default 0,
  unique (id, event_id)
);

create table public.judge_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  judge_id uuid not null references public.users(id) on delete cascade,
  submission_id uuid not null,
  assigned_at timestamptz not null default now(),
  unique (judge_id, submission_id),
  unique (id, event_id),
  foreign key (submission_id, event_id) references public.submissions(id, event_id) on delete cascade
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  judge_assignment_id uuid not null,
  criterion_id uuid not null,
  score numeric(6,2) not null check (score >= 0),
  feedback text not null default '',
  locked boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (judge_assignment_id, criterion_id),
  foreign key (judge_assignment_id, event_id) references public.judge_assignments(id, event_id) on delete cascade,
  foreign key (criterion_id, event_id) references public.rubric_criteria(id, event_id) on delete cascade
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  team_id uuid,
  type text not null check (type in ('participation', 'winner', 'volunteer')),
  rank_label text,
  certificate_code text not null unique,
  file_url text,
  issued_at timestamptz not null default now(),
  foreign key (team_id, event_id) references public.teams(id, event_id) on delete set null
);

-- -----------------------------------------------------------------------------
-- 4. CREW SYNC AI & OPERATIONS TABLES
-- -----------------------------------------------------------------------------
create table public.volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  availability jsonb not null default '[]'::jsonb,
  consent_to_contact boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger trg_volunteer_profiles_updated_at
  before update on public.volunteer_profiles
  for each row execute function public.set_updated_at();

create table public.volunteer_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_name text not null,
  invitation_status public.volunteer_invite_status not null default 'invited',
  confirmed boolean not null default false,
  attended boolean not null default false,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (event_id, user_id, role_name)
);

create table public.event_collaborations (
  id uuid primary key default gen_random_uuid(),
  primary_event_id uuid references public.events(id) on delete set null,
  partner_event_id uuid references public.events(id) on delete set null,
  primary_club_id uuid not null references public.clubs(id) on delete cascade,
  partner_club_id uuid not null references public.clubs(id) on delete cascade,
  proposal text not null,
  role_split jsonb not null default '{}'::jsonb,
  approval_status public.collaboration_status not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (primary_club_id <> partner_club_id)
);

create trigger trg_event_collaborations_updated_at
  before update on public.event_collaborations
  for each row execute function public.set_updated_at();

create table public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  team_id uuid,
  check_in_time timestamptz not null default now(),
  check_in_method text not null default 'qr' check (check_in_method in ('qr', 'manual')),
  check (user_id is not null or team_id is not null),
  foreign key (team_id, event_id) references public.teams(id, event_id) on delete cascade
);

create table public.club_activity_metrics (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  event_count integer not null default 0 check (event_count >= 0),
  registrations_count integer not null default 0 check (registrations_count >= 0),
  attendance_count integer not null default 0 check (attendance_count >= 0),
  active_members_count integer not null default 0 check (active_members_count >= 0),
  volunteer_participation_count integer not null default 0 check (volunteer_participation_count >= 0),
  computed_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (club_id, period_start, period_end)
);

create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  type public.recommendation_type not null,
  event_id uuid references public.events(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  title text not null,
  summary text not null,
  explanation text not null,
  payload jsonb not null default '{}'::jsonb,
  source_records jsonb not null default '[]'::jsonb,
  confidence_score numeric(4,3) check (confidence_score >= 0 and confidence_score <= 1),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status public.recommendation_status not null default 'pending_review',
  created_by_agent text not null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  verified_metrics_snapshot jsonb not null default '{}'::jsonb,
  generated_narrative text not null default '',
  organizer_notes text not null default '',
  approval_status public.report_status not null default 'draft',
  approved_by uuid references public.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_event_reports_updated_at
  before update on public.event_reports
  for each row execute function public.set_updated_at();

create table public.budget_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  title text not null,
  description text not null default '',
  requested_amount numeric(12,2) not null check (requested_amount > 0),
  approved_amount numeric(12,2) check (approved_amount is null or approved_amount >= 0),
  status public.budget_status not null default 'draft',
  requested_by uuid not null references public.users(id) on delete restrict,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_budget_requests_updated_at
  before update on public.budget_requests
  for each row execute function public.set_updated_at();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  budget_request_id uuid references public.budget_requests(id) on delete set null,
  title text not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  receipt_url text,
  incurred_at timestamptz not null default now(),
  recorded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type public.approval_entity_type not null,
  entity_id uuid not null,
  club_id uuid references public.clubs(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete restrict,
  status public.approval_status not null default 'pending',
  decision_notes text not null default '',
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_approvals_updated_at
  before update on public.approvals
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. SAFE PUBLIC DIRECTORY VIEW (Excludes email & roll_number)
-- -----------------------------------------------------------------------------
create or replace view public.user_directory as
select
  id,
  name,
  department,
  year,
  skills,
  interests,
  role,
  avatar_url
from public.users;

grant select on public.user_directory to authenticated;

-- -----------------------------------------------------------------------------
-- 6. SECURITY DEFINER HELPERS & ROLE ESCALATION PROTECTION
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_club_organizer_for(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.club_members cm
    where cm.club_id = target_club_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'lead')
      and cm.membership_status = 'active'
  ) or public.current_user_role() = 'college_admin';
$$;

create or replace function public.is_event_organizer(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and public.is_club_organizer_for(e.club_id)
  );
$$;

-- Prevent self-assigned privilege escalation on INSERT or UPDATE
create or replace function public.enforce_user_role_protection()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  caller_role text := coalesce(auth.role(), '');
begin
  -- Trusted server-side/service_role or SQL migrations (auth.uid() is null) may set any role
  if caller_role = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.current_user_role() is distinct from 'college_admin' then
      new.role := 'student';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       and public.current_user_role() is distinct from 'college_admin' then
      raise exception 'Only trusted server-side admin operations can change user roles.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

create trigger trg_users_role_protection
  before insert or update on public.users
  for each row execute function public.enforce_user_role_protection();

-- Deterministic venue clash check including setup/teardown buffers
create or replace function public.detect_venue_clashes(
  p_event_id uuid,
  p_venue_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_setup_minutes integer default 30,
  p_teardown_minutes integer default 30
)
returns table (
  conflicting_event_id uuid,
  conflicting_title text,
  conflicting_club_id uuid,
  conflict_start timestamptz,
  conflict_end timestamptz
)
language sql
stable
set search_path = public, pg_catalog
as $$
  select
    e.id,
    e.title,
    e.club_id,
    e.start_time,
    e.end_time
  from public.events e
  where e.venue_id = p_venue_id
    and e.id is distinct from p_event_id
    and e.status in ('published', 'ongoing', 'pending_approval')
    and tstzrange(
      e.start_time - make_interval(mins => e.setup_buffer_minutes),
      e.end_time + make_interval(mins => e.teardown_buffer_minutes),
      '[)'
    ) && tstzrange(
      p_start_time - make_interval(mins => p_setup_minutes),
      p_end_time + make_interval(mins => p_teardown_minutes),
      '[)'
    );
$$;

-- -----------------------------------------------------------------------------
-- 7. INDEXES FOR QUERY PERFORMANCE
-- -----------------------------------------------------------------------------
create index idx_club_members_user_id on public.club_members (user_id);
create index idx_events_club_status on public.events (club_id, status);
create index idx_events_venue_time on public.events (venue_id, start_time, end_time);
create index idx_registrations_event_status on public.registrations (event_id, status);
create index idx_registrations_user_id on public.registrations (user_id);
create index idx_team_members_team_id on public.team_members (team_id);
create index idx_team_invites_email_status on public.team_invites (invited_email, status);
create index idx_submissions_event_id on public.submissions (event_id);
create index idx_judge_assignments_judge_id on public.judge_assignments (judge_id);
create index idx_certificates_user_id on public.certificates (user_id);
create index idx_volunteer_assignments_event_id on public.volunteer_assignments (event_id);
create index idx_event_attendance_event_id on public.event_attendance (event_id);
create index idx_ai_recommendations_club_status on public.ai_recommendations (club_id, status);
create index idx_budget_requests_club_status on public.budget_requests (club_id, status);
create index idx_expenses_club_event on public.expenses (club_id, event_id);
create index idx_approvals_status_entity on public.approvals (status, entity_type, entity_id);
create index idx_notifications_user_unread on public.notifications (user_id, read_at, created_at desc);

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES FOR EVERY TABLE
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.submissions enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.judge_assignments enable row level security;
alter table public.scores enable row level security;
alter table public.certificates enable row level security;
alter table public.volunteer_profiles enable row level security;
alter table public.volunteer_assignments enable row level security;
alter table public.event_collaborations enable row level security;
alter table public.event_attendance enable row level security;
alter table public.club_activity_metrics enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.event_reports enable row level security;
alter table public.budget_requests enable row level security;
alter table public.expenses enable row level security;
alter table public.approvals enable row level security;
alter table public.notifications enable row level security;

-- USERS: Restrict private fields (email, roll_number) to self or college_admin
create policy "users_select_own_or_admin" on public.users
  for select to authenticated
  using (id = auth.uid() or public.current_user_role() = 'college_admin');

create policy "users_insert_own" on public.users
  for insert to authenticated
  with check (id = auth.uid() or public.current_user_role() = 'college_admin');

create policy "users_update_own_or_admin" on public.users
  for update to authenticated
  using (id = auth.uid() or public.current_user_role() = 'college_admin')
  with check (id = auth.uid() or public.current_user_role() = 'college_admin');

-- CLUBS
create policy "clubs_select_authenticated" on public.clubs
  for select to authenticated
  using (status = 'active' or public.is_club_organizer_for(id));

create policy "clubs_insert_authenticated" on public.clubs
  for insert to authenticated
  with check (owner_id = auth.uid() or public.current_user_role() = 'college_admin');

create policy "clubs_update_organizer_or_admin" on public.clubs
  for update to authenticated
  using (public.is_club_organizer_for(id))
  with check (public.is_club_organizer_for(id));

create policy "clubs_delete_admin" on public.clubs
  for delete to authenticated
  using (public.current_user_role() = 'college_admin');

-- CLUB MEMBERS
create policy "club_members_select_own_or_organizer" on public.club_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_club_organizer_for(club_id));

create policy "club_members_insert_organizer" on public.club_members
  for insert to authenticated
  with check (public.is_club_organizer_for(club_id));

create policy "club_members_update_organizer" on public.club_members
  for update to authenticated
  using (public.is_club_organizer_for(club_id))
  with check (public.is_club_organizer_for(club_id));

create policy "club_members_delete_self_or_organizer" on public.club_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_club_organizer_for(club_id));

-- VENUES
create policy "venues_select_authenticated" on public.venues
  for select to authenticated using (true);

create policy "venues_modify_admin" on public.venues
  for all to authenticated
  using (public.current_user_role() = 'college_admin')
  with check (public.current_user_role() = 'college_admin');

-- EVENTS
create policy "events_select_visible" on public.events
  for select to authenticated
  using (
    status in ('published', 'ongoing', 'completed')
    or public.is_club_organizer_for(club_id)
  );

create policy "events_insert_organizer" on public.events
  for insert to authenticated
  with check (public.is_club_organizer_for(club_id) and created_by = auth.uid());

create policy "events_update_organizer" on public.events
  for update to authenticated
  using (public.is_club_organizer_for(club_id))
  with check (public.is_club_organizer_for(club_id));

create policy "events_delete_organizer" on public.events
  for delete to authenticated
  using (public.is_club_organizer_for(club_id));

-- REGISTRATIONS
create policy "registrations_select_own_or_organizer" on public.registrations
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));

create policy "registrations_insert_own" on public.registrations
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "registrations_update_own_or_organizer" on public.registrations
  for update to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id))
  with check (user_id = auth.uid() or public.is_event_organizer(event_id));

-- TEAMS
create policy "teams_select_participant_or_organizer" on public.teams
  for select to authenticated
  using (
    leader_id = auth.uid()
    or public.is_event_organizer(event_id)
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = id and tm.user_id = auth.uid()
    )
  );

create policy "teams_insert_student" on public.teams
  for insert to authenticated
  with check (leader_id = auth.uid());

create policy "teams_update_leader_or_organizer" on public.teams
  for update to authenticated
  using (leader_id = auth.uid() or public.is_event_organizer(event_id))
  with check (leader_id = auth.uid() or public.is_event_organizer(event_id));

create policy "teams_delete_leader_or_organizer" on public.teams
  for delete to authenticated
  using (leader_id = auth.uid() or public.is_event_organizer(event_id));

-- TEAM MEMBERS
create policy "team_members_select_team_or_organizer" on public.team_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_event_organizer(event_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.leader_id = auth.uid()
    )
  );

create policy "team_members_insert_leader_or_self" on public.team_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_event_organizer(event_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.leader_id = auth.uid()
    )
  );

create policy "team_members_update_leader_or_self" on public.team_members
  for update to authenticated
  using (
    user_id = auth.uid()
    or public.is_event_organizer(event_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.leader_id = auth.uid()
    )
  );

-- TEAM INVITES
create policy "team_invites_select_relevant" on public.team_invites
  for select to authenticated
  using (
    invited_user_id = auth.uid()
    or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_event_organizer(event_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.leader_id = auth.uid()
    )
  );

create policy "team_invites_insert_leader_or_organizer" on public.team_invites
  for insert to authenticated
  with check (
    public.is_event_organizer(event_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.leader_id = auth.uid()
    )
  );

create policy "team_invites_update_recipient_or_leader" on public.team_invites
  for update to authenticated
  using (
    invited_user_id = auth.uid()
    or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_event_organizer(event_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.leader_id = auth.uid()
    )
  );

-- SUBMISSIONS
create policy "submissions_select_team_judge_organizer" on public.submissions
  for select to authenticated
  using (
    public.is_event_organizer(event_id)
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_id and tm.user_id = auth.uid() and tm.status = 'accepted'
    )
    or exists (
      select 1 from public.judge_assignments ja
      where ja.submission_id = id and ja.judge_id = auth.uid()
    )
  );

create policy "submissions_insert_team_member" on public.submissions
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.team_members tm
      where tm.team_id = team_id and tm.user_id = auth.uid() and tm.status = 'accepted'
    )
  );

create policy "submissions_update_team_or_organizer" on public.submissions
  for update to authenticated
  using (
    public.is_event_organizer(event_id)
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_id and tm.user_id = auth.uid() and tm.status = 'accepted'
    )
  );

-- RUBRIC CRITERIA
create policy "rubric_criteria_select_authenticated" on public.rubric_criteria
  for select to authenticated using (true);

create policy "rubric_criteria_modify_organizer" on public.rubric_criteria
  for all to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

-- JUDGE ASSIGNMENTS
create policy "judge_assignments_select_own_or_organizer" on public.judge_assignments
  for select to authenticated
  using (judge_id = auth.uid() or public.is_event_organizer(event_id));

create policy "judge_assignments_modify_organizer" on public.judge_assignments
  for all to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

-- SCORES
create policy "scores_select_own_or_organizer" on public.scores
  for select to authenticated
  using (
    public.is_event_organizer(event_id)
    or exists (
      select 1 from public.judge_assignments ja
      where ja.id = judge_assignment_id and ja.judge_id = auth.uid()
    )
  );

create policy "scores_insert_assigned_judge" on public.scores
  for insert to authenticated
  with check (
    exists (
      select 1 from public.judge_assignments ja
      where ja.id = judge_assignment_id and ja.judge_id = auth.uid()
    )
  );

create policy "scores_update_unlocked_or_admin" on public.scores
  for update to authenticated
  using (
    public.current_user_role() = 'college_admin'
    or (
      locked = false
      and exists (
        select 1 from public.judge_assignments ja
        where ja.id = judge_assignment_id and ja.judge_id = auth.uid()
      )
    )
  );

-- CERTIFICATES
create policy "certificates_select_own_or_organizer" on public.certificates
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));

create policy "certificates_modify_organizer" on public.certificates
  for all to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

-- VOLUNTEER PROFILES
create policy "volunteer_profiles_select" on public.volunteer_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      consent_to_contact = true
      and public.current_user_role() in ('club_organizer', 'college_admin')
    )
  );

create policy "volunteer_profiles_modify_own" on public.volunteer_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- VOLUNTEER ASSIGNMENTS
create policy "volunteer_assignments_select_own_or_organizer" on public.volunteer_assignments
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));

create policy "volunteer_assignments_insert_organizer" on public.volunteer_assignments
  for insert to authenticated
  with check (public.is_event_organizer(event_id));

create policy "volunteer_assignments_update_student_or_organizer" on public.volunteer_assignments
  for update to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));

create policy "volunteer_assignments_delete_organizer" on public.volunteer_assignments
  for delete to authenticated
  using (public.is_event_organizer(event_id));

-- EVENT COLLABORATIONS
create policy "event_collaborations_select_involved" on public.event_collaborations
  for select to authenticated
  using (
    public.is_club_organizer_for(primary_club_id)
    or public.is_club_organizer_for(partner_club_id)
  );

create policy "event_collaborations_modify_involved" on public.event_collaborations
  for all to authenticated
  using (
    public.is_club_organizer_for(primary_club_id)
    or public.is_club_organizer_for(partner_club_id)
  )
  with check (
    public.is_club_organizer_for(primary_club_id)
    or public.is_club_organizer_for(partner_club_id)
  );

-- EVENT ATTENDANCE
create policy "event_attendance_select_own_or_organizer" on public.event_attendance
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));

create policy "event_attendance_modify_organizer" on public.event_attendance
  for all to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

-- CLUB ACTIVITY METRICS
create policy "club_activity_metrics_select_organizer" on public.club_activity_metrics
  for select to authenticated
  using (public.is_club_organizer_for(club_id));

create policy "club_activity_metrics_modify_admin" on public.club_activity_metrics
  for all to authenticated
  using (public.current_user_role() = 'college_admin')
  with check (public.current_user_role() = 'college_admin');

-- AI RECOMMENDATIONS
create policy "ai_recommendations_select" on public.ai_recommendations
  for select to authenticated
  using (
    public.current_user_role() = 'college_admin'
    or (club_id is not null and public.is_club_organizer_for(club_id))
    or (event_id is not null and public.is_event_organizer(event_id))
  );

create policy "ai_recommendations_insert_organizer" on public.ai_recommendations
  for insert to authenticated
  with check (
    public.current_user_role() = 'college_admin'
    or (club_id is not null and public.is_club_organizer_for(club_id))
    or (event_id is not null and public.is_event_organizer(event_id))
  );

create policy "ai_recommendations_update_reviewer" on public.ai_recommendations
  for update to authenticated
  using (
    public.current_user_role() = 'college_admin'
    or (club_id is not null and public.is_club_organizer_for(club_id))
    or (event_id is not null and public.is_event_organizer(event_id))
  );

-- EVENT REPORTS
create policy "event_reports_select" on public.event_reports
  for select to authenticated
  using (approval_status = 'published' or public.is_event_organizer(event_id));

create policy "event_reports_modify_organizer" on public.event_reports
  for all to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

-- BUDGET REQUESTS
create policy "budget_requests_select_organizer" on public.budget_requests
  for select to authenticated
  using (public.is_club_organizer_for(club_id));

create policy "budget_requests_insert_organizer" on public.budget_requests
  for insert to authenticated
  with check (public.is_club_organizer_for(club_id) and requested_by = auth.uid());

create policy "budget_requests_update_organizer_or_admin" on public.budget_requests
  for update to authenticated
  using (
    public.current_user_role() = 'college_admin'
    or (public.is_club_organizer_for(club_id) and status in ('draft', 'submitted'))
  );

-- EXPENSES
create policy "expenses_select_organizer" on public.expenses
  for select to authenticated
  using (public.is_club_organizer_for(club_id));

create policy "expenses_modify_organizer" on public.expenses
  for all to authenticated
  using (public.is_club_organizer_for(club_id))
  with check (public.is_club_organizer_for(club_id));

-- APPROVALS
create policy "approvals_select_relevant" on public.approvals
  for select to authenticated
  using (
    requested_by = auth.uid()
    or public.current_user_role() = 'college_admin'
    or (club_id is not null and public.is_club_organizer_for(club_id))
  );

create policy "approvals_insert_requester" on public.approvals
  for insert to authenticated
  with check (requested_by = auth.uid());

create policy "approvals_update_admin_only" on public.approvals
  for update to authenticated
  using (public.current_user_role() = 'college_admin')
  with check (public.current_user_role() = 'college_admin');

-- NOTIFICATIONS
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications_insert_admin_or_organizer" on public.notifications
  for insert to authenticated
  with check (public.current_user_role() in ('club_organizer', 'college_admin'));
