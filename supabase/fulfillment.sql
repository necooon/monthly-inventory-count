-- 発注・買い物用の不足カラム（既存プロジェクト向け。全文の setup.sql は再実行しない）

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
alter table public.items add column if not exists pending_product_id uuid;
alter table public.items drop constraint if exists items_pending_mode_check;
alter table public.items
  add constraint items_pending_mode_check
  check (pending_mode is null or pending_mode in ('shopping', 'receipt'));
