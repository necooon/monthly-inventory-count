window.CheckStock = window.CheckStock || {};

CheckStock.constants = {
  SUPABASE_CONFIG: {
    url: 'https://dmvznvxczrpbqrzfcqcc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnpudnhjenJwYnFyemZjcWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NjgxNjUsImV4cCI6MjEwMzU0NDE2NX0.tOPfmnQr5HTPk28H-bvfTIuhLzhjBB33JLeZldxzndM'
  },
  DEFAULT_CYCLES: ['MONTHLY', 'WEEKLY'],
  DEFAULT_PLACES: ['洗面所', 'キッチン', 'トイレ'],
  DEFAULT_CATEGORIES: ['医薬品', '日用品', '食品・調味料', '水・コーヒー・お茶・飲料'],
  DEFAULT_UNITS: ['個', '本', '袋', '箱', 'パック'],
  REMOVED_LOCATION: 'その他',
  ALL_FILTER: 'すべて',
  UNSET_PLACE_FILTER: '未選択',
  UNSET_CATEGORY_LABEL: '未分類',
  UNIT_SEP: '::',
  ADD_NEW_VALUE: 'ADD_NEW',
  RENAME_VALUE: 'RENAME',
  DELETE_VALUE: 'DELETE',
  APP_TITLE: 'Check＆Stock',
  PAGE_IDS: ['inventory', 'order', 'settings'],
  ITEM_UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
};

CheckStock.constants.CATEGORY_PLACE_NAMES = new Set(CheckStock.constants.DEFAULT_CATEGORIES);

var C = CheckStock.constants;
