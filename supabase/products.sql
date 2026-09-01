-- 商品（アイテム一対多）と購入履歴
-- 既存の items テーブルがあるプロジェクト向け。全文の setup.sql は再実行しない。

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
