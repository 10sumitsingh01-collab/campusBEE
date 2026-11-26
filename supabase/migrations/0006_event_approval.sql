-- Apply the same publication gate to direct authenticated database clients.
create function public.enforce_event_review() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.current_user_role() = 'college_admin' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status in ('draft','pending_approval') then return new; end if;
  elsif new.club_id = old.club_id and (new.status = old.status or new.status = 'cancelled'
      or (old.status = 'draft' and new.status = 'pending_approval')) then
    return new;
  end if;
  raise exception 'College admin approval is required to publish an event.';
end;
$$;
create trigger enforce_event_review before insert or update on public.events
for each row execute function public.enforce_event_review();
