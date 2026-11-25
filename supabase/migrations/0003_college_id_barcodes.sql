-- =============================================================================
-- CampusOS: Additive Migration 0003 - College ID Barcode Scanner
-- =============================================================================
-- Safe to run once after 0002_qr_event_passes.sql. Does NOT modify 0001/0002.
-- =============================================================================

-- 1. Optional barcode_token & college on public.users for enrolled students
alter table public.users
  add column if not exists college text,
  add column if not exists barcode_token text unique;

-- 2. College ID Cards registry (supports both real users and clearly marked demo IDs)
create table if not exists public.college_id_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  usn text not null unique,
  email text not null,
  department text not null,
  year integer not null check (year >= 1 and year <= 6),
  college text not null default 'BMS Institute of Technology',
  barcode_token text not null unique,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_college_id_cards_barcode
  on public.college_id_cards (barcode_token);

create index if not exists idx_college_id_cards_usn
  on public.college_id_cards (usn);

-- 3. Strict RLS: Only club_organizer and college_admin may look up student ID cards
alter table public.college_id_cards enable row level security;

create policy "college_id_cards_select_organizer_or_admin"
  on public.college_id_cards
  for select to authenticated
  using (public.current_user_role() in ('club_organizer', 'college_admin'));

create policy "college_id_cards_modify_admin"
  on public.college_id_cards
  for all to authenticated
  using (public.current_user_role() = 'college_admin')
  with check (public.current_user_role() = 'college_admin');

-- 4. Seed the 4 fictional DEMO College ID records (idempotent)
insert into public.college_id_cards (
  id, name, usn, email, department, year, college, barcode_token, is_demo
) values
  (
    '44444444-4444-4444-4444-444444444401',
    'Aarav Sharma', '1BM24CS001', 'aarav.sharma@campus.edu',
    'CSE', 2, 'BMS College of Engineering (Demo)', 'CID-1BM24-8F3A19', true
  ),
  (
    '44444444-4444-4444-4444-444444444402',
    'Priya Nair', '1BM24CS002', 'priya.nair@campus.edu',
    'CSE', 2, 'BMS College of Engineering (Demo)', 'CID-1BM24-4C7D20', true
  ),
  (
    '44444444-4444-4444-4444-444444444403',
    'Rahul Verma', '1BM24EC003', 'rahul.verma@campus.edu',
    'ECE', 2, 'BMS College of Engineering (Demo)', 'CID-1BM24-9E1B55', true
  ),
  (
    '44444444-4444-4444-4444-444444444404',
    'Sneha Rao', '1BM24IS004', 'sneha.rao@campus.edu',
    'ISE', 2, 'BMS College of Engineering (Demo)', 'CID-1BM24-2A6F88', true
  )
on conflict (usn) do update set
  barcode_token = excluded.barcode_token,
  is_demo = true;
