const SUPABASE_CONFIG = {
  url: 'https://dmvznvxczrpbqrzfcqcc.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnpudnhjenJwYnFyemZjcWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NjgxNjUsImV4cCI6MjEwMzU0NDE2NX0.tOPfmnQr5HTPk28H-bvfTIuhLzhjBB33JLeZldxzndM'
};
const DEFAULT_CYCLES = ['月単位', '週単位'];
const LEGACY_CYCLE_NAMES = { MONTHLY: '月単位', WEEKLY: '週単位' };
const DEFAULT_PLACES = ['洗面所', 'キッチン', 'トイレ'];
const DEFAULT_CATEGORIES = ['医薬品', '日用品', '食品・調味料', '水・コーヒー・お茶・飲料'];
const DEFAULT_UNITS = ['個', '本', '袋', '箱', 'パック'];
const CATEGORY_PLACE_NAMES = new Set(DEFAULT_CATEGORIES);
const REMOVED_LOCATION = 'その他';
const ALL_FILTER = 'すべて';
const UNSET_PLACE_FILTER = '未選択';
const UNSET_CATEGORY_LABEL = '未分類';
const UNIT_SEP = '::';
const ADD_NEW_VALUE = 'ADD_NEW';
const RENAME_VALUE = 'RENAME';
const DELETE_VALUE = 'DELETE';

let customUnits = loadNameList('stockUnits', DEFAULT_UNITS);

function normalizeCycleName(name) {
  const trimmed = String(name || '').trim();
  return LEGACY_CYCLE_NAMES[trimmed] || trimmed;
}

function migrateCycleNames(list) {
  const seen = new Set();
  const next = [];
  (list || []).forEach(name => {
    const normalized = normalizeCycleName(name);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next.length ? next : [...DEFAULT_CYCLES];
}

let customCycles = migrateCycleNames(loadNameList('stockCycles', DEFAULT_CYCLES));
let customPlaces = loadNameList('stockPlaces', loadNameList('stockLocations', DEFAULT_PLACES));
customPlaces = customPlaces.filter(loc => loc !== REMOVED_LOCATION && !CATEGORY_PLACE_NAMES.has(loc));
if (customPlaces.length === 0) customPlaces = [...DEFAULT_PLACES];

let customCategories = loadNameList('stockCategories', DEFAULT_CATEGORIES);

let customCheckUnits = loadCheckUnitMaster();
customCheckUnits = customCheckUnits.filter(u => !CATEGORY_PLACE_NAMES.has(u.place));

let inventoryCycleFilter = ALL_FILTER;
let inventoryPlaceFilter = ALL_FILTER;
let inventoryCollapsedPlaces = loadInventoryCollapsedPlaces();
let settingsOpenSections = loadSettingsOpenSections();
let catalogCycleFilter = ALL_FILTER;
let catalogPlaceFilter = ALL_FILTER;
let catalogCategoryFilter = ALL_FILTER;
let orderCategoryFilter = ALL_FILTER;
let currentPage = localStorage.getItem('currentPage') || 'inventory';
let selectedItemId = null;
let editingItemId = null;
let applyingRemote = false;
let supabaseClient = null;
let syncUnsub = null;
let syncTimer = null;
let pullTimer = null;
let cloudPushInProgress = false;
let pullAfterPush = false;
let skipScheduledCloudSave = false;
let localSyncEpoch = 0;
let cloudHydrated = false;

const APP_TITLE = 'Check＆Stock';
const PAGE_IDS = ['inventory', 'order', 'settings'];
const ITEM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isItemUuid(id) {
  return ITEM_UUID_RE.test(String(id || ''));
}

function newItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (currentPage === 'items') currentPage = 'settings';
if (!PAGE_IDS.includes(currentPage)) currentPage = 'inventory';
let inventoryUnenteredOnly = false;
let lastOrderUndo = null;
let undoToastTimer = null;

function loadNameList(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(parsed)) {
      const names = parsed.map(v => String(v).trim()).filter(Boolean);
      if (names.length) return names;
    }
  } catch (e) { /* ignore */ }
  return [...fallback];
}

function unitKey(unit) {
  return unit.cycle + UNIT_SEP + (unit.place || '');
}

function parseUnitKey(key) {
  if (!key || key === ALL_FILTER) return null;
  const idx = String(key).indexOf(UNIT_SEP);
  if (idx < 0) return null;
  const cycle = String(key).slice(0, idx).trim();
  const place = String(key).slice(idx + UNIT_SEP.length).trim();
  if (!cycle) return null;
  return { cycle, place };
}

function placeLabel(place) {
  return place ? place : UNSET_PLACE_FILTER;
}

function normalizeCategory(value) {
  const name = String(value || '').trim();
  if (!name || name === UNSET_CATEGORY_LABEL) return '';
  return name;
}

function collectUniqueNames(primary, extras, normalizeFn) {
  const seen = new Set();
  const names = [];
  const push = (raw) => {
    const name = normalizeFn(raw);
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  primary.forEach(push);
  extras.forEach(push);
  return names;
}

function allCategories() {
  return collectUniqueNames(customCategories, stockItems.map(item => item.category), normalizeCategory);
}

function settingsCategoryNames() {
  return allCategories();
}

function canonicalizeStockUnit(name) {
  const trimmed = String(name || '').trim();
  if (DEFAULT_UNITS.includes(trimmed)) return trimmed;
  if (['巻', 'ロール', 'チューブ'].includes(trimmed)) return '本';
  if (['缶', '瓶', 'ケース'].includes(trimmed)) return '箱';
  if (trimmed === 'パック') return 'パック';
  if (trimmed === '袋') return '袋';
  return '個';
}

function ensureUnit(name) {
  const trimmed = canonicalizeStockUnit(name);
  if (!trimmed) return null;
  return ensureName(customUnits, trimmed);
}

function defaultUnitName() {
  if (customUnits.includes('個')) return '個';
  return customUnits[0] || DEFAULT_UNITS[0] || '個';
}

function ensureCategory(name) {
  const trimmed = normalizeCategory(name);
  if (!trimmed) return '';
  return ensureName(customCategories, trimmed);
}

function unitsEqual(a, b) {
  return !!(a && b && a.cycle === b.cycle && (a.place || '') === (b.place || ''));
}

function fallbackCycleName() {
  return customCycles[0] || DEFAULT_CYCLES[0];
}

function normalizeUnit(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw.cycle) {
    const cycle = normalizeCycleName(String(raw.cycle).trim());
    const place = String(raw.place || '').trim();
    if (!cycle || place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return null;
    return { cycle, place };
  }
  if (typeof raw === 'string') {
    const parsed = parseUnitKey(raw);
    if (parsed) return parsed;
    const place = raw.trim();
    if (!place || place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return null;
    return { cycle: fallbackCycleName(), place };
  }
  return null;
}

function loadCheckUnitMaster() {
  try {
    const parsed = JSON.parse(localStorage.getItem('stockCheckUnits'));
    if (Array.isArray(parsed) && parsed.length) {
      const units = parsed.map(normalizeUnit).filter(Boolean);
      if (units.length) return dedupeUnits(units);
    }
  } catch (e) { /* ignore */ }
  return customPlaces.map(place => ({ cycle: fallbackCycleName(), place }));
}

function dedupeUnits(units) {
  const seen = new Set();
  const next = [];
  (units || []).forEach(unit => {
    const key = unitKey(unit);
    if (seen.has(key)) return;
    seen.add(key);
    next.push(unit);
  });
  return next;
}

function persistMasters() {
  localStorage.setItem('stockCycles', JSON.stringify(customCycles));
  localStorage.setItem('stockPlaces', JSON.stringify(customPlaces));
  localStorage.setItem('stockLocations', JSON.stringify(customPlaces));
  localStorage.setItem('stockCategories', JSON.stringify(customCategories));
  localStorage.setItem('stockUnits', JSON.stringify(customUnits));
  localStorage.setItem('stockCheckUnits', JSON.stringify(customCheckUnits));
}

function ensureName(list, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  if (!list.includes(trimmed)) list.push(trimmed);
  return trimmed;
}

function ensureCycle(name) {
  return ensureName(customCycles, name);
}

function ensurePlace(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed === REMOVED_LOCATION) return null;
  return ensureName(customPlaces, trimmed);
}

function ensureCheckUnit(cycleName, placeName) {
  const cycle = ensureCycle(cycleName);
  if (!cycle) return null;
  const place = String(placeName || '').trim();
  if (place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return null;
  if (place) ensurePlace(place);
  const unit = { cycle, place };
  if (!customCheckUnits.some(u => unitsEqual(u, unit))) customCheckUnits.push(unit);
  return unit;
}

function rewriteCheckUnits(mapFn) {
  customCheckUnits = dedupeUnits(customCheckUnits.map(mapFn).filter(Boolean));
  stockItems.forEach(item => {
    const next = dedupeUnits((item.checkUnits || []).map(mapFn).filter(Boolean));
    item.checkUnits = next;
    item.location = next[0] ? next[0].place : '';
  });
}

function remapNamedFilter(current, oldName, nextName) {
  if (current !== oldName) return current;
  return nextName || ALL_FILTER;
}

function isReservedPlaceName(name) {
  return name === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(name);
}

const MASTER_KINDS = {
  cycle: {
    addTitle: '新しいチェック頻度の名前を入力してください',
    renameTitle: 'チェック頻度の新しい名前',
    minAlert: 'チェック頻度は1つ以上必要です。',
    deleteExtra: count => count ? `\n${count}件のアイテムからこのチェック頻度が外れます。` : '',
    minList: () => customCycles,
    uniqueNames: () => customCycles,
    moveList: () => customCycles,
    setList: list => { customCycles = list; },
    ensure: name => ensureCycle(name),
    usageCount: name => stockItems.filter(item => itemCheckUnits(item).some(u => u.cycle === name)).length,
    applyRename: (oldName, next) => {
      const idx = customCycles.indexOf(oldName);
      if (idx < 0) return false;
      customCycles[idx] = next;
      rewriteCheckUnits(u => u.cycle === oldName ? { cycle: next, place: u.place } : u);
      inventoryCycleFilter = remapNamedFilter(inventoryCycleFilter, oldName, next);
      catalogCycleFilter = remapNamedFilter(catalogCycleFilter, oldName, next);
      return true;
    },
    applyDelete: name => {
      if (customCycles.length <= 1) return false;
      customCycles = customCycles.filter(v => v !== name);
      rewriteCheckUnits(u => u.cycle === name ? null : u);
      customCheckUnits = customCheckUnits.filter(u => u.cycle !== name);
      inventoryCycleFilter = remapNamedFilter(inventoryCycleFilter, name, ALL_FILTER);
      catalogCycleFilter = remapNamedFilter(catalogCycleFilter, name, ALL_FILTER);
      return true;
    }
  },
  place: {
    addTitle: '新しい場所の名前を入力してください',
    renameTitle: '場所の新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムの場所は未選択になります。` : '',
    uniqueNames: () => customPlaces,
    moveList: () => customPlaces,
    setList: list => { customPlaces = list; },
    ensure: name => ensurePlace(name),
    validate: name => {
      if (!isReservedPlaceName(name)) return true;
      alert('その名前は場所に使えません。');
      return false;
    },
    usageCount: name => stockItems.filter(item => itemCheckUnits(item).some(u => u.place === name)).length,
    applyRename: (oldName, next) => {
      const idx = customPlaces.indexOf(oldName);
      if (idx < 0) return false;
      customPlaces[idx] = next;
      if (inventoryCollapsedPlaces.has(oldName)) {
        inventoryCollapsedPlaces.delete(oldName);
        inventoryCollapsedPlaces.add(next);
        persistInventoryCollapsedPlaces();
      }
      rewriteCheckUnits(u => u.place === oldName ? { cycle: u.cycle, place: next } : u);
      inventoryPlaceFilter = remapNamedFilter(inventoryPlaceFilter, oldName, next);
      catalogPlaceFilter = remapNamedFilter(catalogPlaceFilter, oldName, next);
      return true;
    },
    applyDelete: name => {
      customPlaces = customPlaces.filter(v => v !== name);
      if (inventoryCollapsedPlaces.has(name)) {
        inventoryCollapsedPlaces.delete(name);
        persistInventoryCollapsedPlaces();
      }
      rewriteCheckUnits(u => u.place === name ? { cycle: u.cycle, place: '' } : u);
      customCheckUnits = customCheckUnits.filter(u => u.place !== name);
      inventoryPlaceFilter = remapNamedFilter(inventoryPlaceFilter, name, ALL_FILTER);
      catalogPlaceFilter = remapNamedFilter(catalogPlaceFilter, name, ALL_FILTER);
      return true;
    }
  },
  category: {
    addTitle: '新しいカテゴリの名前を入力してください',
    renameTitle: 'カテゴリの新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムは未分類になります。` : '',
    uniqueNames: () => customCategories,
    moveList: () => settingsCategoryNames(),
    setList: list => { customCategories = list; },
    ensure: name => ensureCategory(name),
    usageCount: name => stockItems.filter(item => normalizeCategory(item.category) === name).length,
    applyRename: (oldName, next) => {
      if (!customCategories.includes(oldName)) customCategories.push(oldName);
      const idx = customCategories.indexOf(oldName);
      customCategories[idx] = next;
      stockItems.forEach(item => {
        if (normalizeCategory(item.category) === oldName) item.category = next;
      });
      catalogCategoryFilter = remapNamedFilter(catalogCategoryFilter, oldName, next);
      orderCategoryFilter = remapNamedFilter(orderCategoryFilter, oldName, next);
      return true;
    },
    applyDelete: name => {
      customCategories = customCategories.filter(v => v !== name);
      stockItems.forEach(item => {
        if (normalizeCategory(item.category) === name) item.category = '';
      });
      catalogCategoryFilter = remapNamedFilter(catalogCategoryFilter, name, ALL_FILTER);
      orderCategoryFilter = remapNamedFilter(orderCategoryFilter, name, ALL_FILTER);
      return true;
    }
  },
  unit: {
    addTitle: '新しい単位を入力してください',
    renameTitle: '単位の新しい名前',
    minAlert: '単位は1つ以上必要です。',
    deleteExtra: count => count ? `\n${count}件のアイテムは「${defaultUnitName()}」になります。` : '',
    minList: () => customUnits,
    uniqueNames: () => allUnits(),
    ensure: name => ensureUnit(name),
    usageCount: name => stockItems.filter(item => item.unit === name).length,
    applyRename: (oldName, next) => {
      if (customUnits.includes(oldName)) {
        customUnits[customUnits.indexOf(oldName)] = next;
      } else if (!customUnits.includes(next)) {
        customUnits.push(next);
      }
      stockItems.forEach(item => {
        if (item.unit === oldName) item.unit = next;
      });
      return true;
    },
    applyDelete: name => {
      if (customUnits.length <= 1) return false;
      const fallback = customUnits.find(u => u !== name) || defaultUnitName();
      customUnits = customUnits.filter(v => v !== name);
      stockItems.forEach(item => {
        if (item.unit === name) item.unit = fallback;
      });
      return true;
    }
  }
};

async function addMasterName(kind) {
  const spec = MASTER_KINDS[kind];
  const raw = await showPrompt(spec.addTitle);
  if (!raw || !raw.trim()) return;
  const trimmed = raw.trim();
  if (spec.validate && !spec.validate(trimmed)) return;
  spec.ensure(trimmed);
  await persistAndFlushCloud();
  return trimmed;
}

async function persistAndFlushCloud() {
  skipScheduledCloudSave = true;
  try {
    saveAndRender();
  } finally {
    skipScheduledCloudSave = false;
  }
  await flushCloudSave();
}

async function renameMasterName(kind, oldName) {
  const spec = MASTER_KINDS[kind];
  const raw = await showPrompt(spec.renameTitle, oldName);
  if (!raw || !raw.trim()) return;
  const next = raw.trim();
  if (next === oldName) return;
  if (spec.validate && !spec.validate(next)) return;
  if (spec.uniqueNames().includes(next)) {
    alert('同じ名前がすでにあります。');
    return;
  }
  if (!spec.applyRename(oldName, next)) return;
  await persistAndFlushCloud();
  return next;
}

async function deleteMasterName(kind, name) {
  const spec = MASTER_KINDS[kind];
  const listForMin = spec.minList ? spec.minList() : spec.uniqueNames();
  if (spec.minAlert && listForMin.length <= 1) {
    alert(spec.minAlert);
    return;
  }
  const count = spec.usageCount(name);
  const extra = spec.deleteExtra ? spec.deleteExtra(count) : '';
  if (!confirm(`「${name}」を削除しますか？${extra}`)) return;
  if (!spec.applyDelete(name)) return;
  await persistAndFlushCloud();
  return true;
}

async function moveMasterName(kind, name, delta) {
  const spec = MASTER_KINDS[kind];
  if (!spec || !spec.moveList) return;
  const list = spec.moveList();
  const idx = list.indexOf(name);
  const next = idx + delta;
  if (idx < 0 || next < 0 || next >= list.length) return;
  const swapped = list[idx];
  list[idx] = list[next];
  list[next] = swapped;
  spec.setList(list);
  await persistAndFlushCloud();
}

function loadSettingsOpenSections() {
  try {
    const parsed = JSON.parse(localStorage.getItem('settingsOpenSections'));
    if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  } catch (e) { /* ignore */ }
  return new Set(['items']);
}

function persistSettingsOpenSections() {
  localStorage.setItem('settingsOpenSections', JSON.stringify([...settingsOpenSections]));
}

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function formatLastOrder(value) {
  const date = normalizeDate(value);
  if (!date) return '';
  const parts = date.split('-');
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function itemCheckUnits(item) {
  let units = [];
  if (Array.isArray(item.checkUnits)) units = item.checkUnits.map(normalizeUnit).filter(Boolean);
  else if (item.location && !CATEGORY_PLACE_NAMES.has(item.location)) {
    const one = normalizeUnit(item.location);
    if (one) units = [one];
  }
  units = dedupeUnits(units).filter(u => customCheckUnits.some(master => unitsEqual(master, u)));
  return units;
}

function setItemCheckUnits(item, units) {
  const next = dedupeUnits((units || []).map(normalizeUnit).filter(Boolean))
    .filter(u => customCheckUnits.some(master => unitsEqual(master, u)));
  item.checkUnits = next;
  item.location = item.checkUnits[0] ? item.checkUnits[0].place : '';
}

function allUnits() {
  return collectUniqueNames(customUnits, stockItems.map(item => item.unit), value => String(value || '').trim());
}

function rememberUnit(name) {
  ensureUnit(name);
}

function itemMatchesCyclePlace(item, cycleFilter, placeFilter) {
  const units = itemCheckUnits(item);
  if (!units.length) {
    return cycleFilter === ALL_FILTER && (placeFilter === ALL_FILTER || placeFilter === UNSET_PLACE_FILTER);
  }
  return units.some(u =>
    (cycleFilter === ALL_FILTER || u.cycle === cycleFilter) &&
    (placeFilter === ALL_FILTER || (placeFilter === UNSET_PLACE_FILTER ? !u.place : u.place === placeFilter))
  );
}

function itemMatchesCategory(item, categoryFilter) {
  if (categoryFilter === ALL_FILTER) return true;
  const category = normalizeCategory(item.category);
  if (categoryFilter === UNSET_CATEGORY_LABEL) return !category;
  return category === categoryFilter;
}

function needsOrder(item) {
  return item.entered && item.count <= item.orderThreshold;
}

function isComplete(item) {
  return item.entered && item.count > item.orderThreshold;
}

function syncItemFlags(item) {
  item.complete = isComplete(item);
}

function migrateItem(item) {
  const next = { ...item };
  if (next.target === undefined) next.target = 1;
  if (next.entered === undefined) next.entered = true;
  if (next.unit === undefined) next.unit = '個';
  next.unit = canonicalizeStockUnit(next.unit);
  if (next.orderThreshold === undefined) next.orderThreshold = Math.max(0, next.target - 1);
  next.lastOrderedOn = normalizeDate(next.lastOrderedOn);
  let categoryFromPlaces = '';
  let units = [];
  const rawUnits = Array.isArray(next.checkUnits) ? next.checkUnits : [];
  rawUnits.forEach(raw => {
    const place = raw && typeof raw === 'object' ? String(raw.place || '').trim() : '';
    const cycle = raw && typeof raw === 'object' ? String(raw.cycle || '').trim() : '';
    if (CATEGORY_PLACE_NAMES.has(place)) {
      if (!categoryFromPlaces) categoryFromPlaces = place;
      if (cycle) units.push({ cycle, place: '' });
      return;
    }
    const normalized = normalizeUnit(raw);
    if (normalized) units.push(normalized);
  });
  if (!Array.isArray(item.checkUnits) && next.location && !CATEGORY_PLACE_NAMES.has(next.location)) {
    const one = normalizeUnit(next.location);
    if (one) units = [one];
  }
  if (CATEGORY_PLACE_NAMES.has(String(next.location || '').trim()) && !categoryFromPlaces) {
    categoryFromPlaces = String(next.location).trim();
  }
  next.category = normalizeCategory(next.category) || categoryFromPlaces;
  if (next.category) ensureCategory(next.category);
  units = dedupeUnits(units);
  units.forEach(u => ensureCheckUnit(u.cycle, u.place));
  next.checkUnits = units;
  next.location = units[0] ? units[0].place : '';
  next.complete = !!(next.entered && next.count > next.orderThreshold);
  if (!isItemUuid(next.id)) next.id = newItemId();
  return next;
}

function loadInventoryCollapsedPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem('inventoryCollapsedPlaces'));
    if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  } catch (e) { /* ignore */ }
  return new Set();
}

function persistInventoryCollapsedPlaces() {
  localStorage.setItem('inventoryCollapsedPlaces', JSON.stringify([...inventoryCollapsedPlaces]));
}

function persistLocalState() {
  stockItems.forEach(syncItemFlags);
  localStorage.setItem('monthlyStockWithLocation', JSON.stringify(stockItems));
  persistMasters();
  if (applyingRemote) return;
  if (typeof isCloudReady === 'function' && isCloudReady() && !cloudHydrated) return;
  localSyncEpoch += 1;
  if (!skipScheduledCloudSave) scheduleCloudSave();
}

function saveAndRender() {
  persistLocalState();
  renderAll();
}

function findItemById(id) {
  const key = String(id);
  return stockItems.find(i => String(i.id) === key);
}

// データの読み込み
let stockItems = JSON.parse(localStorage.getItem('monthlyStockWithLocation')) || [
  { id: 1, name: 'トイレットペーパー', count: 2, location: 'トイレ', checkUnits: [{ cycle: '月単位', place: 'トイレ' }], target: 4, orderThreshold: 1, unit: '巻', entered: true },
  { id: 2, name: '洗濯洗剤', count: 1, location: '洗面所', checkUnits: [{ cycle: '月単位', place: '洗面所' }], target: 2, orderThreshold: 1, unit: '本', entered: true },
  { id: 3, name: '食器用洗剤', count: 0, location: 'キッチン', checkUnits: [{ cycle: '月単位', place: 'キッチン' }], target: 2, orderThreshold: 0, unit: '本', entered: false }
];

stockItems = stockItems.map(migrateItem);
localStorage.setItem('monthlyStockWithLocation', JSON.stringify(stockItems));
stockItems.forEach(item => rememberUnit(item.unit));
persistMasters();
