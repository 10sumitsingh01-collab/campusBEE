alter table public.registrations drop constraint if exists registrations_registration_type_check;
alter table public.registrations add constraint registrations_registration_type_check
  check (registration_type in ('solo','team','volunteer'));
alter table public.registrations add constraint volunteer_without_team
  check (registration_type <> 'volunteer' or team_id is null);

-- Serialize seat allocation even when different students register at the same time.
create function public.enforce_event_seats() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare seats int;
begin
  if new.status <> 'registered' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));
  if tg_op = 'UPDATE' and old.status = 'registered' and old.event_id = new.event_id
    and old.user_id = new.user_id then
    if old.registration_type <> new.registration_type then raise exception 'Already registered for this event'; end if;
    return new;
  end if;
  select v.capacity into seats from events e join venues v on v.id=e.venue_id where e.id=new.event_id;
  if (select count(*) from registrations where event_id=new.event_id and status='registered' and id<>new.id) >= seats
    then raise exception 'This event is full'; end if;
  if new.registration_type='volunteer' and exists(select 1 from team_members where event_id=new.event_id and user_id=new.user_id and status='accepted')
    then raise exception 'Already participating as a contestant'; end if;
  return new;
end $$;
create trigger enforce_event_seats before insert or update on public.registrations for each row execute function public.enforce_event_seats();

-- Create the team, membership and pass together so a full event cannot leave a partial team.
create function public.register_event_participant(p_event uuid, p_kind text, p_team_name text, p_contact jsonb,
  p_ticket text, p_qr text, p_invite uuid default null) returns jsonb
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare ev events; tm teams; reg registrations; invitation team_invites;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_event::text,0));
  select * into strict ev from events where id=p_event and status='published' and registration_deadline>=now();
  if auth.uid() is null or current_user_role()<>'student' then raise exception 'Student login required'; end if;
  if p_kind not in ('volunteer','team','solo') then raise exception 'Invalid registration role'; end if;
  if exists(select 1 from registrations where event_id=p_event and user_id=auth.uid() and status='registered')
    then raise exception 'Already registered for this event'; end if;
  if p_invite is not null then
    select * into strict invitation from team_invites where id=p_invite and event_id=p_event and status='pending'
      and expires_at>now() and (invited_user_id=auth.uid() or lower(invited_email)=lower(auth.jwt()->>'email')) for update;
    select * into strict tm from teams where id=invitation.team_id and status='forming';
    if p_kind<>'team' or (select count(*) from team_members where team_id=tm.id and status='accepted')>=ev.max_team_size then raise exception 'Team unavailable'; end if;
    insert into team_members(team_id,event_id,user_id,role,status) values(tm.id,p_event,auth.uid(),'member','accepted');
    update team_invites set status='accepted' where id=p_invite;
  elsif p_kind<>'volunteer' then
    insert into teams(event_id,name,leader_id,status,locked_at) values(p_event,p_team_name,auth.uid(),
      (case when p_kind='solo' then 'locked' else 'forming' end)::public.team_status,case when p_kind='solo' then now() end) returning * into tm;
    insert into team_members(team_id,event_id,user_id,role,status) values(tm.id,p_event,auth.uid(),'leader','accepted');
  end if;
  insert into registrations(event_id,user_id,team_id,registration_type,status,attendee_name,attendee_email,phone,college,custom_fields,ticket_code,qr_token)
    values(p_event,auth.uid(),tm.id,p_kind,'registered',p_contact->>'name',auth.jwt()->>'email',p_contact->>'phone',p_contact->>'college',
    coalesce(p_contact->'customFields','{}'::jsonb),p_ticket,p_qr) returning * into reg;
  return jsonb_build_object('team',to_jsonb(tm),'registration',to_jsonb(reg));
end $$;
