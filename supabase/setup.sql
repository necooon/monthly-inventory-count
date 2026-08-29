-- Supabase SQL Editor で実行してください
create table if not exists public.households (
  id text primary key,
  items jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;

drop policy if exists "households_select" on public.households;
drop policy if exists "households_insert" on public.households;
drop policy if exists "households_update" on public.households;

create policy "households_select" on public.households for select using (true);
create policy "households_insert" on public.households for insert with check (true);
create policy "households_update" on public.households for update using (true);

do $$
begin
  alter publication supabase_realtime add table public.households;
exception
  when duplicate_object then null;
end $$;
