-- =============================================================================
-- CampusOS: Idempotent Demo QR Ticket Seed (run AFTER 0002_qr_event_passes.sql)
-- =============================================================================
do $$
declare
  v_user_id uuid;
  v_user_name text;
  v_user_email text;
begin
  select id, name, email
  into v_user_id, v_user_name, v_user_email
  from public.users
  order by created_at asc
  limit 1;

  if v_user_id is null then
    raise notice 'No users in public.users yet. Sign up at /login first, then rerun seed_qr_demo.sql.';
    return;
  end if;

  insert into public.registrations (
    event_id, user_id, registration_type, status,
    attendee_name, attendee_email, phone, college, custom_fields,
    ticket_code, qr_token
  ) values
    (
      '33333333-3333-3333-3333-333333333301',
      v_user_id,
      'team',
      'registered',
      v_user_name,
      v_user_email,
      '+91 98765 43210',
      'Campus Institute of Technology',
      '{"track": "Campus AI Agents"}'::jsonb,
      'TKT-AI2026',
      '9f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a3210'
    ),
    (
      '33333333-3333-3333-3333-333333333303',
      v_user_id,
      'solo',
      'registered',
      v_user_name,
      v_user_email,
      '+91 98765 43210',
      'Campus Institute of Technology',
      '{"track": "Figma Prototyping"}'::jsonb,
      'TKT-UI2026',
      '1a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f7890'
    )
  on conflict (event_id, user_id) do update set
    ticket_code = excluded.ticket_code,
    qr_token = excluded.qr_token,
    attendee_name = excluded.attendee_name,
    attendee_email = excluded.attendee_email,
    phone = excluded.phone,
    college = excluded.college;
end
$$;
