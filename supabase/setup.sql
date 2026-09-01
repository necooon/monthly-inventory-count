-- Stock & Check 向けスキーマ（1世帯固定）
-- Supabase SQL Editor で実行してください（既存の jsonb 版 households があれば自動移行し、最後に household_id を外します）

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
  id uuid primary key default gen_random_uuid(),
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
  item_id uuid not null references public.items(id) on delete cascade,
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
            case
              when coalesce(item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (item->>'id')::uuid
              else gen_random_uuid()
            end,
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

-- チェック周期・チェック単位（周期×場所）・前回発注日
alter table public.items add column if not exists last_ordered_on date;

create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists public.check_units (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households(id) on delete cascade,
  cycle_id uuid not null references public.cycles(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, cycle_id, location_id)
);

create index if not exists cycles_household_id_idx on public.cycles (household_id, sort_order);
create index if not exists check_units_household_id_idx on public.check_units (household_id, sort_order);
create index if not exists check_units_cycle_id_idx on public.check_units (cycle_id);
create index if not exists check_units_location_id_idx on public.check_units (location_id);

insert into public.cycles (household_id, name, sort_order)
select h.id, v.name, v.sort_order
from public.households h
cross join (values ('月単位', 0), ('週単位', 1)) as v(name, sort_order)
on conflict (household_id, name) do nothing;

insert into public.check_units (household_id, cycle_id, location_id, sort_order)
select l.household_id, c.id, l.id, l.sort_order
from public.locations l
join public.cycles c on c.household_id = l.household_id and c.name = '月単位'
on conflict (household_id, cycle_id, location_id) do nothing;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'item_check_units' and column_name = 'location_id'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'item_check_units' and column_name = 'check_unit_id'
    ) then
      alter table public.item_check_units add column check_unit_id uuid;
    end if;

    update public.item_check_units icu
    set check_unit_id = cu.id
    from public.check_units cu
    join public.cycles c on c.id = cu.cycle_id and c.name = '月単位'
    where icu.check_unit_id is null
      and cu.location_id = icu.location_id
      and cu.household_id = icu.household_id;

    delete from public.item_check_units where check_unit_id is null;

    alter table public.item_check_units drop constraint if exists item_check_units_pkey;
    alter table public.item_check_units drop constraint if exists item_check_units_location_id_fkey;
    drop index if exists public.item_check_units_location_id_idx;
    alter table public.item_check_units drop column if exists location_id;
    alter table public.item_check_units alter column check_unit_id set not null;
    alter table public.item_check_units drop constraint if exists item_check_units_check_unit_id_fkey;
    alter table public.item_check_units
      add constraint item_check_units_check_unit_id_fkey
      foreign key (check_unit_id) references public.check_units(id) on delete restrict;
    alter table public.item_check_units add primary key (item_id, check_unit_id);
    create index if not exists item_check_units_check_unit_id_idx on public.item_check_units (check_unit_id);
  end if;
end $$;

insert into public.item_check_units (item_id, check_unit_id, household_id)
select i.id, cu.id, i.household_id
from public.items i
join public.check_units cu on cu.location_id = i.location_id and cu.household_id = i.household_id
join public.cycles c on c.id = cu.cycle_id and c.name = '月単位'
on conflict (item_id, check_unit_id) do nothing;

alter table public.cycles enable row level security;
alter table public.check_units enable row level security;

drop policy if exists "cycles_select" on public.cycles;
drop policy if exists "cycles_insert" on public.cycles;
drop policy if exists "cycles_update" on public.cycles;
drop policy if exists "cycles_delete" on public.cycles;
create policy "cycles_select" on public.cycles for select using (true);
create policy "cycles_insert" on public.cycles for insert with check (true);
create policy "cycles_update" on public.cycles for update using (true);
create policy "cycles_delete" on public.cycles for delete using (true);

drop policy if exists "check_units_select" on public.check_units;
drop policy if exists "check_units_insert" on public.check_units;
drop policy if exists "check_units_update" on public.check_units;
drop policy if exists "check_units_delete" on public.check_units;
create policy "check_units_select" on public.check_units for select using (true);
create policy "check_units_insert" on public.check_units for insert with check (true);
create policy "check_units_update" on public.check_units for update using (true);
create policy "check_units_delete" on public.check_units for delete using (true);

do $$
begin
  alter publication supabase_realtime add table public.cycles;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.check_units;
exception
  when duplicate_object then null;
end $$;

alter table public.items add column if not exists category text not null default '';
alter table public.check_units alter column location_id drop not null;
alter table public.items alter column location_id drop not null;
alter table public.check_units drop constraint if exists check_units_household_id_cycle_id_location_id_key;
create unique index if not exists check_units_hh_cycle_loc_uidx
  on public.check_units (household_id, cycle_id, location_id)
  where location_id is not null;
create unique index if not exists check_units_hh_cycle_null_loc_uidx
  on public.check_units (household_id, cycle_id)
  where location_id is null;

-- カテゴリ・単位マスター
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create index if not exists categories_household_id_idx on public.categories (household_id, sort_order);
create index if not exists units_household_id_idx on public.units (household_id, sort_order);

insert into public.categories (household_id, name, sort_order)
select h.id, v.name, v.sort_order
from public.households h
cross join (values
  ('医薬品', 0),
  ('日用品', 1),
  ('食品・調味料', 2),
  ('水・コーヒー・お茶・飲料', 3)
) as v(name, sort_order)
on conflict (household_id, name) do nothing;

insert into public.categories (household_id, name, sort_order)
select i.household_id, i.category, 1000 + row_number() over (partition by i.household_id order by i.category)
from public.items i
where coalesce(i.category, '') <> ''
on conflict (household_id, name) do nothing;

insert into public.units (household_id, name, sort_order)
select h.id, v.name, v.sort_order
from public.households h
cross join (values
  ('個', 0),
  ('本', 1),
  ('袋', 2),
  ('箱', 3),
  ('パック', 4)
) as v(name, sort_order)
on conflict (household_id, name) do nothing;

insert into public.units (household_id, name, sort_order)
select i.household_id, i.unit, 1000 + row_number() over (partition by i.household_id order by i.unit)
from public.items i
where coalesce(i.unit, '') <> ''
on conflict (household_id, name) do nothing;

alter table public.categories enable row level security;
alter table public.units enable row level security;

drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_insert" on public.categories;
drop policy if exists "categories_update" on public.categories;
drop policy if exists "categories_delete" on public.categories;
create policy "categories_select" on public.categories for select using (true);
create policy "categories_insert" on public.categories for insert with check (true);
create policy "categories_update" on public.categories for update using (true);
create policy "categories_delete" on public.categories for delete using (true);

drop policy if exists "units_select" on public.units;
drop policy if exists "units_insert" on public.units;
drop policy if exists "units_update" on public.units;
drop policy if exists "units_delete" on public.units;
create policy "units_select" on public.units for select using (true);
create policy "units_insert" on public.units for insert with check (true);
create policy "units_update" on public.units for update using (true);
create policy "units_delete" on public.units for delete using (true);

do $$
begin
  alter publication supabase_realtime add table public.categories;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.units;
exception
  when duplicate_object then null;
end $$;

-- items.id / item_check_units.item_id を uuid に移行
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'items'
      and column_name = 'id'
      and data_type = 'text'
  ) then
    alter table public.items add column id_uuid uuid;
    update public.items
    set id_uuid = case
      when id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then id::uuid
      else gen_random_uuid()
    end;

    alter table public.item_check_units add column item_id_uuid uuid;
    update public.item_check_units icu
    set item_id_uuid = i.id_uuid
    from public.items i
    where icu.item_id = i.id;
    delete from public.item_check_units where item_id_uuid is null;

    alter table public.item_check_units drop constraint if exists item_check_units_item_id_fkey;
    alter table public.item_check_units drop constraint if exists item_check_units_pkey;

    alter table public.items drop constraint if exists items_pkey;
    alter table public.items drop column id;
    alter table public.items rename column id_uuid to id;
    alter table public.items alter column id set default gen_random_uuid();
    alter table public.items alter column id set not null;
    alter table public.items add primary key (id);

    alter table public.item_check_units drop column item_id;
    alter table public.item_check_units rename column item_id_uuid to item_id;
    alter table public.item_check_units alter column item_id set not null;
    alter table public.item_check_units
      add constraint item_check_units_item_id_fkey
      foreign key (item_id) references public.items(id) on delete cascade;
    alter table public.item_check_units add primary key (item_id, check_unit_id);
  end if;
end $$;

-- 1世帯固定: household_id を廃止
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'household_id'
  ) then
    alter table public.locations drop constraint if exists locations_household_id_name_key;
    alter table public.locations drop constraint if exists locations_household_id_fkey;
    alter table public.items drop constraint if exists items_household_id_fkey;
    alter table public.item_check_units drop constraint if exists item_check_units_household_id_fkey;
    alter table public.cycles drop constraint if exists cycles_household_id_name_key;
    alter table public.cycles drop constraint if exists cycles_household_id_fkey;
    alter table public.check_units drop constraint if exists check_units_household_id_fkey;
    alter table public.categories drop constraint if exists categories_household_id_name_key;
    alter table public.categories drop constraint if exists categories_household_id_fkey;
    alter table public.units drop constraint if exists units_household_id_name_key;
    alter table public.units drop constraint if exists units_household_id_fkey;

    drop index if exists public.locations_household_id_idx;
    drop index if exists public.items_household_id_idx;
    drop index if exists public.item_check_units_household_id_idx;
    drop index if exists public.cycles_household_id_idx;
    drop index if exists public.check_units_household_id_idx;
    drop index if exists public.categories_household_id_idx;
    drop index if exists public.units_household_id_idx;
    drop index if exists public.check_units_hh_cycle_loc_uidx;
    drop index if exists public.check_units_hh_cycle_null_loc_uidx;

    alter table public.locations drop column if exists household_id;
    alter table public.items drop column if exists household_id;
    alter table public.item_check_units drop column if exists household_id;
    alter table public.cycles drop column if exists household_id;
    alter table public.check_units drop column if exists household_id;
    alter table public.categories drop column if exists household_id;
    alter table public.units drop column if exists household_id;

    alter table public.locations drop constraint if exists locations_name_key;
    alter table public.locations add constraint locations_name_key unique (name);
    alter table public.cycles drop constraint if exists cycles_name_key;
    alter table public.cycles add constraint cycles_name_key unique (name);
    alter table public.categories drop constraint if exists categories_name_key;
    alter table public.categories add constraint categories_name_key unique (name);
    alter table public.units drop constraint if exists units_name_key;
    alter table public.units add constraint units_name_key unique (name);

    create unique index if not exists check_units_cycle_loc_uidx
      on public.check_units (cycle_id, location_id) nulls not distinct;

    create index if not exists locations_sort_order_idx on public.locations (sort_order);
    create index if not exists cycles_sort_order_idx on public.cycles (sort_order);
    create index if not exists categories_sort_order_idx on public.categories (sort_order);
    create index if not exists units_sort_order_idx on public.units (sort_order);
    create index if not exists check_units_sort_order_idx on public.check_units (sort_order);

    drop table if exists public.households;
  end if;
end $$;

-- 単位候補を 個・本・袋・箱・パック の5つにまとめる
update public.items
set unit = case
  when unit in ('本', '巻', 'ロール', 'チューブ') then '本'
  when unit = '袋' then '袋'
  when unit in ('箱', '缶', '瓶', 'ケース') then '箱'
  when unit = 'パック' then 'パック'
  else '個'
end
where coalesce(unit, '') <> '';

delete from public.units
where name not in ('個', '本', '袋', '箱', 'パック');

insert into public.units (name, sort_order)
values ('個', 0), ('本', 1), ('袋', 2), ('箱', 3), ('パック', 4)
on conflict (name) do update set sort_order = excluded.sort_order;

-- 購入先マスター
-- 既存プロジェクトへ kind / pending だけ足すなら supabase/fulfillment.sql を使う
create table if not exists public.purchase_destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.purchase_destinations drop constraint if exists purchase_destinations_name_key;
alter table public.purchase_destinations add constraint purchase_destinations_name_key unique (name);
create index if not exists purchase_destinations_sort_order_idx on public.purchase_destinations (sort_order);

alter table public.items add column if not exists purchase_destinations text[] not null default '{}';

insert into public.purchase_destinations (name, sort_order)
values ('LOHACO', 0), ('ドラッグストア', 1), ('スーパー', 2)
on conflict (name) do nothing;

alter table public.purchase_destinations add column if not exists kind text not null default 'store';
update public.purchase_destinations set kind = 'store' where kind is null or kind not in ('online', 'store');
alter table public.purchase_destinations drop constraint if exists purchase_destinations_kind_check;
alter table public.purchase_destinations
  add constraint purchase_destinations_kind_check check (kind in ('online', 'store'));

update public.purchase_destinations set kind = 'online' where name = 'LOHACO';
update public.purchase_destinations set kind = 'store' where name in ('ドラッグストア', 'スーパー');

alter table public.items add column if not exists pending_mode text;
alter table public.items add column if not exists pending_dest text;
alter table public.items add column if not exists pending_qty integer;
alter table public.items drop constraint if exists items_pending_mode_check;
alter table public.items
  add constraint items_pending_mode_check
  check (pending_mode is null or pending_mode in ('shopping', 'receipt'));

alter table public.purchase_destinations enable row level security;
drop policy if exists "purchase_destinations_select" on public.purchase_destinations;
drop policy if exists "purchase_destinations_insert" on public.purchase_destinations;
drop policy if exists "purchase_destinations_update" on public.purchase_destinations;
drop policy if exists "purchase_destinations_delete" on public.purchase_destinations;
create policy "purchase_destinations_select" on public.purchase_destinations for select using (true);
create policy "purchase_destinations_insert" on public.purchase_destinations for insert with check (true);
create policy "purchase_destinations_update" on public.purchase_destinations for update using (true);
create policy "purchase_destinations_delete" on public.purchase_destinations for delete using (true);

do $$
begin
  alter publication supabase_realtime add table public.purchase_destinations;
exception
  when duplicate_object then null;
end $$;

-- 商品（アイテム一対多）と購入履歴
-- 既存プロジェクトへ足すだけなら supabase/products.sql を使う（このファイル全文は再実行しない）
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete set null,
  name text not null,
  purchase_destinations text[] not null default '{}',
  url text not null default '',
  barcode text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_item_id_idx on public.products (item_id);

create table if not exists public.purchase_history (
  id uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null default now(),
  item_id uuid,
  item_name text not null default '',
  product_id uuid,
  product_name text not null default '',
  dest text not null default '',
  qty integer not null default 0,
  mode text not null default 'shopping',
  created_at timestamptz not null default now()
);
create index if not exists purchase_history_happened_at_idx on public.purchase_history (happened_at desc);

alter table public.items add column if not exists pending_product_id uuid;

alter table public.products enable row level security;
alter table public.purchase_history enable row level security;

drop policy if exists "products_select" on public.products;
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;
drop policy if exists "products_delete" on public.products;
create policy "products_select" on public.products for select using (true);
create policy "products_insert" on public.products for insert with check (true);
create policy "products_update" on public.products for update using (true);
create policy "products_delete" on public.products for delete using (true);

drop policy if exists "purchase_history_select" on public.purchase_history;
drop policy if exists "purchase_history_insert" on public.purchase_history;
drop policy if exists "purchase_history_update" on public.purchase_history;
drop policy if exists "purchase_history_delete" on public.purchase_history;
create policy "purchase_history_select" on public.purchase_history for select using (true);
create policy "purchase_history_insert" on public.purchase_history for insert with check (true);
create policy "purchase_history_update" on public.purchase_history for update using (true);
create policy "purchase_history_delete" on public.purchase_history for delete using (true);

do $$
begin
  alter publication supabase_realtime add table public.products;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.purchase_history;
exception
  when duplicate_object then null;
end $$;

