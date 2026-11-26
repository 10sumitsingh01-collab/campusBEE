-- Additive. Apply once after review. Event/team/project records stay in existing tables.
create table public.competition_workspaces (
  event_id uuid primary key references public.events(id) on delete cascade,
  revision bigint not null default 0,
  state jsonb not null check (jsonb_typeof(state) = 'object')
);
alter table public.competition_workspaces enable row level security;
revoke all on public.competition_workspaces from public, anon, authenticated;
grant select, insert, update on public.competition_workspaces to service_role;

alter table public.submissions add column problem_statement text not null default '';
