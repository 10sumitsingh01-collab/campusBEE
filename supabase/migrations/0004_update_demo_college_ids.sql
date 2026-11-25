-- =============================================================================
-- CampusOS: Additive Migration 0004 - Update Demo College ID Cards
-- =============================================================================
-- Safe to run once after 0003_college_id_barcodes.sql.
-- Does NOT modify or rerun 0001_initial_schema.sql.
-- =============================================================================

-- Allow partial student ID records where barcode/USN/dept/year/college are not yet provided
alter table public.college_id_cards
  alter column usn drop not null,
  alter column department drop not null,
  alter column year drop not null,
  alter column college drop not null,
  alter column barcode_token drop not null;

-- Replace previous demo records with the updated 4 demo students
delete from public.college_id_cards where is_demo = true;

insert into public.college_id_cards (
  id, name, usn, email, department, year, college, barcode_token, is_demo
) values
  (
    '44444444-4444-4444-4444-444444444401',
    'Shlok Saitavya', '1BY25EC137', 'shlok.saitavya@campus.edu',
    'CSE', 2, 'BMSIT', '19764', true
  ),
  (
    '44444444-4444-4444-4444-444444444402',
    'Sumit Singh', null, 'sumit.singh@campus.edu',
    null, null, null, null, true
  ),
  (
    '44444444-4444-4444-4444-444444444403',
    'Archit Sharma', '1BY25CS055', 'archit.sharma@campus.edu',
    'CSE', 2, 'BMSIT', '19691', true
  ),
  (
    '44444444-4444-4444-4444-444444444404',
    'Rohan Singh', '1BY25EC124', 'rohan.singh@campus.edu',
    'CSE', 2, 'BMSIT', '19944', true
  )
on conflict (id) do update set
  name = excluded.name,
  usn = excluded.usn,
  email = excluded.email,
  department = excluded.department,
  year = excluded.year,
  college = excluded.college,
  barcode_token = excluded.barcode_token,
  is_demo = true;
