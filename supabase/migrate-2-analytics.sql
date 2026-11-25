-- Adds usage logging. Paste into Supabase > SQL Editor > New query, then Run.
-- Safe to run more than once.

alter table people add column if not exists last_seen timestamptz;

create table if not exists events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  type text not null,
  person text,
  details jsonb not null default '{}',
  version text
);
create index if not exists events_type_at_idx on events(type, at desc);
create index if not exists events_person_at_idx on events(person, at desc);

-- Same lockdown as the other tables: only the server can touch it.
alter table events enable row level security;
grant all on events to service_role;
grant all on all sequences in schema public to service_role;
