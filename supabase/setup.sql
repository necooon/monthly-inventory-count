-- 食品・日用品ストック棚卸向けスキーマ
-- Supabase SQL Editor で実行してください（既存の jsonb 版 households があれば自動移行します）

create table if not exists public.households (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.households add column if not exists created_at timestamptz not null default now();
alter table public.households add column if not exists updated_at timestamptz not null default now();

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists public.items (
  id text primary key,
  household_id text not null references public.households(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  name text not null,
  count integer not null default 0 check (count >= 0),
  target_qty integer not null default 1 check (target_qty >= 0),
  order_threshold integer not null default 0 check (order_threshold >= 0),
  unit text not null default '個',
  entered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.item_check_units (
  item_id text not null references public.items(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  household_id text not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, location_id)
);

create index if not exists locations_household_id_idx on public.locations (household_id, sort_order);
create index if not exists items_household_id_idx on public.items (household_id);
create index if not exists items_location_id_idx on public.items (location_id);
create index if not exists item_check_units_household_id_idx on public.item_check_units (household_id);
create index if not exists item_check_units_location_id_idx on public.item_check_units (location_id);

-- 旧 jsonb カラムからの移行
do $$
declare
  rec record;
  loc_name text;
  loc_id uuid;
  item jsonb;
  idx int;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'households'
      and column_name = 'items'
  ) then
    for rec in select id, items, locations from public.households loop
      idx := 0;
      if rec.locations is not null and jsonb_typeof(rec.locations) = 'array' then
        for loc_name in select jsonb_array_elements_text(rec.locations) loop
          insert into public.locations (household_id, name, sort_order)
          values (rec.id, loc_name, idx)
          on conflict (household_id, name) do update set sort_order = excluded.sort_order;
          idx := idx + 1;
        end loop;
      end if;

      if rec.items is not null and jsonb_typeof(rec.items) = 'array' then
        for item in select jsonb_array_elements(rec.items) loop
          select l.id into loc_id
          from public.locations l
          where l.household_id = rec.id
            and l.name = coalesce(item->>'location', '');

          if loc_id is null then
            insert into public.locations (household_id, name, sort_order)
            values (rec.id, coalesce(nullif(item->>'location', ''), '未設定'), 1000)
            on conflict (household_id, name) do update set name = excluded.name
            returning id into loc_id;

            if loc_id is null then
              select l.id into loc_id
              from public.locations l
              where l.household_id = rec.id
                and l.name = coalesce(nullif(item->>'location', ''), '未設定');
            end if;
          end if;

          insert into public.items (
            id, household_id, location_id, name, count, target_qty, order_threshold, unit, entered
          ) values (
            coalesce(item->>'id', gen_random_uuid()::text),
            rec.id,
            loc_id,
            coalesce(item->>'name', '無題'),
            greatest(coalesce((item->>'count')::int, 0), 0),
            greatest(coalesce((item->>'target')::int, 1), 0),
            greatest(coalesce((item->>'orderThreshold')::int, 0), 0),
            coalesce(nullif(item->>'unit', ''), '個'),
            coalesce((item->>'entered')::boolean, false)
          )
          on conflict (id) do update set
            location_id = excluded.location_id,
            name = excluded.name,
            count = excluded.count,
            target_qty = excluded.target_qty,
            order_threshold = excluded.order_threshold,
            unit = excluded.unit,
            entered = excluded.entered,
            updated_at = now();
        end loop;
      end if;
    end loop;

    alter table public.households drop column if exists items;
    alter table public.households drop column if exists locations;
  end if;
end $$;

-- 既存 items.location_id からチェック単位の所属を移行
insert into public.item_check_units (item_id, location_id, household_id)
select i.id, i.location_id, i.household_id
from public.items i
on conflict (item_id, location_id) do nothing;

alter table public.households enable row level security;
alter table public.locations enable row level security;
alter table public.items enable row level security;
alter table public.item_check_units enable row level security;

drop policy if exists "households_select" on public.households;
drop policy if exists "households_insert" on public.households;
drop policy if exists "households_update" on public.households;
drop policy if exists "households_delete" on public.households;
create policy "households_select" on public.households for select using (true);
create policy "households_insert" on public.households for insert with check (true);
create policy "households_update" on public.households for update using (true);
create policy "households_delete" on public.households for delete using (true);

drop policy if exists "locations_select" on public.locations;
drop policy if exists "locations_insert" on public.locations;
drop policy if exists "locations_update" on public.locations;
drop policy if exists "locations_delete" on public.locations;
create policy "locations_select" on public.locations for select using (true);
create policy "locations_insert" on public.locations for insert with check (true);
create policy "locations_update" on public.locations for update using (true);
create policy "locations_delete" on public.locations for delete using (true);

drop policy if exists "items_select" on public.items;
drop policy if exists "items_insert" on public.items;
drop policy if exists "items_update" on public.items;
drop policy if exists "items_delete" on public.items;
create policy "items_select" on public.items for select using (true);
create policy "items_insert" on public.items for insert with check (true);
create policy "items_update" on public.items for update using (true);
create policy "items_delete" on public.items for delete using (true);

drop policy if exists "item_check_units_select" on public.item_check_units;
drop policy if exists "item_check_units_insert" on public.item_check_units;
drop policy if exists "item_check_units_update" on public.item_check_units;
drop policy if exists "item_check_units_delete" on public.item_check_units;
create policy "item_check_units_select" on public.item_check_units for select using (true);
create policy "item_check_units_insert" on public.item_check_units for insert with check (true);
create policy "item_check_units_update" on public.item_check_units for update using (true);
create policy "item_check_units_delete" on public.item_check_units for delete using (true);

do $$
begin
  alter publication supabase_realtime add table public.households;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.locations;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.items;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.item_check_units;
exception
  when duplicate_object then null;
end $$;
