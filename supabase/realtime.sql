-- Realtime メッセージ急増対策（既存プロジェクト向け。全文の setup.sql は再実行しない）
-- 同期はクライアントの Broadcast 1 通に切り替えたため、postgres_changes 用の publication から外す。

do $$
declare
  t text;
begin
  foreach t in array array[
    'households',
    'locations',
    'items',
    'item_check_units',
    'cycles',
    'check_units',
    'categories',
    'units',
    'purchase_destinations',
    'products',
    'purchase_history'
  ]
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
