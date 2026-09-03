window.CheckStock = window.CheckStock || {};

CheckStock.constants = {
  SUPABASE_CONFIG: {
    url: 'https://dmvznvxczrpbqrzfcqcc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnpudnhjenJwYnFyemZjcWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NjgxNjUsImV4cCI6MjEwMzU0NDE2NX0.tOPfmnQr5HTPk28H-bvfTIuhLzhjBB33JLeZldxzndM'
  },
  DEFAULT_CYCLES: ['月単位', '週単位'],
  LEGACY_CYCLE_NAMES: { MONTHLY: '月単位', WEEKLY: '週単位' },
  DEFAULT_PLACES: ['洗面所', 'キッチン', 'トイレ'],
  DEFAULT_CATEGORIES: ['医薬品', '日用品', '食品・調味料', '水・コーヒー・お茶・飲料'],
  DEFAULT_PRODUCT_CATEGORY: '日用品',
  PRODUCT_CATEGORY_RULES: [
    { category: '医薬品', keywords: ['医薬品', 'ヘルスケア', 'おくすり', '漢方', 'サプリ', 'ビタミン', '医療', 'ドラッグストア'] },
    { category: '水・コーヒー・お茶・飲料', keywords: ['飲料', '水・', 'コーヒー', 'お茶', 'ジュース', 'ビール', 'ワイン', 'お酒', 'ドリンク'] },
    { category: '食品・調味料', keywords: ['食品', '調味料', 'お取り寄せ', 'スナック', 'お菓子', '米', '麺', '缶詰', '冷凍', '離乳食', 'ベビーフード', '食品・飲料'] },
    { category: '日用品', keywords: ['洗剤', 'ティッシュ', '日用品', '掃除', 'ペット', 'ベビー', 'ホーム＆キッチン', 'ホーム&キッチン'] },
  ],
  PRODUCT_META_FUNCTION: 'lohaco-product',
  DEFAULT_PURCHASE_DESTS: ['LOHACO', 'ドラッグストア', 'スーパー'],
  LOHACO_DEST_NAME: 'LOHACO',
  DEFAULT_UNITS: ['個', '本', '袋', '箱', 'パック'],
  REMOVED_LOCATION: 'その他',
  ALL_FILTER: 'すべて',
  UNSET_PLACE_FILTER: '未選択',
  UNSET_CATEGORY_LABEL: '未分類',
  UNSET_PURCHASE_DEST_LABEL: '未設定',
  UNIT_SEP: '::',
  ADD_NEW_VALUE: 'ADD_NEW',
  ADD_PRODUCT_URL_VALUE: 'ADD_PRODUCT_URL',
  RENAME_VALUE: 'RENAME',
  DELETE_VALUE: 'DELETE',
  APP_TITLE: 'Check＆Stock',
  PAGE_IDS: ['inventory', 'order', 'shopping', 'pickup', 'settings'],
  ITEM_UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  DEFAULT_STOCK_ITEMS: [
    { id: 1, name: 'トイレットペーパー', count: 2, location: 'トイレ', checkUnits: [{ cycle: '月単位', place: 'トイレ' }], target: 4, orderThreshold: 1, unit: '巻', entered: true },
    { id: 2, name: '洗濯洗剤', count: 1, location: '洗面所', checkUnits: [{ cycle: '月単位', place: '洗面所' }], target: 2, orderThreshold: 1, unit: '本', entered: true },
    { id: 3, name: '食器用洗剤', count: 0, location: 'キッチン', checkUnits: [{ cycle: '月単位', place: 'キッチン' }], target: 2, orderThreshold: 0, unit: '本', entered: false }
  ]
};

CheckStock.constants.CATEGORY_PLACE_NAMES = new Set(CheckStock.constants.DEFAULT_CATEGORIES);

var C = CheckStock.constants;
var SUPABASE_CONFIG = C.SUPABASE_CONFIG;
var DEFAULT_CYCLES = C.DEFAULT_CYCLES;
var LEGACY_CYCLE_NAMES = C.LEGACY_CYCLE_NAMES;
var DEFAULT_PLACES = C.DEFAULT_PLACES;
var DEFAULT_CATEGORIES = C.DEFAULT_CATEGORIES;
var DEFAULT_PRODUCT_CATEGORY = C.DEFAULT_PRODUCT_CATEGORY;
var PRODUCT_CATEGORY_RULES = C.PRODUCT_CATEGORY_RULES;
var PRODUCT_META_FUNCTION = C.PRODUCT_META_FUNCTION;
var DEFAULT_PURCHASE_DESTS = C.DEFAULT_PURCHASE_DESTS;
var LOHACO_DEST_NAME = C.LOHACO_DEST_NAME;
var DEFAULT_UNITS = C.DEFAULT_UNITS;
var CATEGORY_PLACE_NAMES = C.CATEGORY_PLACE_NAMES;
var REMOVED_LOCATION = C.REMOVED_LOCATION;
var ALL_FILTER = C.ALL_FILTER;
var UNSET_PLACE_FILTER = C.UNSET_PLACE_FILTER;
var UNSET_CATEGORY_LABEL = C.UNSET_CATEGORY_LABEL;
var UNSET_PURCHASE_DEST_LABEL = C.UNSET_PURCHASE_DEST_LABEL;
var UNIT_SEP = C.UNIT_SEP;
var ADD_NEW_VALUE = C.ADD_NEW_VALUE;
var ADD_PRODUCT_URL_VALUE = C.ADD_PRODUCT_URL_VALUE;
var RENAME_VALUE = C.RENAME_VALUE;
var DELETE_VALUE = C.DELETE_VALUE;
var APP_TITLE = C.APP_TITLE;
var PAGE_IDS = C.PAGE_IDS;
var ITEM_UUID_RE = C.ITEM_UUID_RE;
var DEFAULT_STOCK_ITEMS = C.DEFAULT_STOCK_ITEMS;
