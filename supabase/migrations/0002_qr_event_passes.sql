-- =============================================================================
-- CampusOS: Additive Migration 0002 - Smart QR Event Pass & Attendance System
-- =============================================================================
-- Safe to run once after 0001_initial_schema.sql. Does NOT modify 0001.
-- =============================================================================

-- 1. Extend public.registrations with attendee details & opaque QR ticket fields
alter table public.registrations
  add column if not exists attendee_name text,
  add column if not exists attendee_email text,
  add column if not exists phone text,
  add column if not exists college text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists ticket_code text unique,
  add column if not exists qr_token text unique;

create index if not exists idx_registrations_qr_token
  on public.registrations (qr_token)
  where qr_token is not null;

create index if not exists idx_registrations_ticket_code
  on public.registrations (ticket_code)
  where ticket_code is not null;

-- 2. Extend public.event_attendance to link registration and prevent duplicate scans atomically
alter table public.event_attendance
  add column if not exists registration_id uuid references public.registrations(id) on delete cascade;

create unique index if not exists unique_attendance_per_registration
  on public.event_attendance (registration_id)
  where registration_id is not null;

create unique index if not exists unique_attendance_per_event_user
  on public.event_attendance (event_id, user_id)
  where user_id is not null;
