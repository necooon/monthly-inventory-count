function isItemUuid(id) {
  return C.ITEM_UUID_RE.test(String(id || ''));
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

function unitKey(unit) {
  return unit.cycle + C.UNIT_SEP + (unit.place || '');
}

function parseUnitKey(key) {
  if (!key || key === C.ALL_FILTER) return null;
  const idx = String(key).indexOf(C.UNIT_SEP);
  if (idx < 0) return null;
  const cycle = String(key).slice(0, idx).trim();
  const place = String(key).slice(idx + C.UNIT_SEP.length).trim();
  if (!cycle) return null;
  return { cycle, place };
}

function placeLabel(place) {
  return place ? place : C.UNSET_PLACE_FILTER;
}

function normalizeCategory(value) {
  const name = String(value || '').trim();
  if (!name || name === C.UNSET_CATEGORY_LABEL) return '';
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
  const { categories } = S().masters;
  return collectUniqueNames(categories, S().stockItems.map(item => item.category), normalizeCategory);
}

function settingsCategoryNames() {
  return allCategories();
}

function canonicalizeStockUnit(name) {
  const trimmed = String(name || '').trim();
  if (C.DEFAULT_UNITS.includes(trimmed)) return trimmed;
  if (['巻', 'ロール', 'チューブ'].includes(trimmed)) return '本';
  if (['缶', '瓶', 'ケース'].includes(trimmed)) return '箱';
  if (trimmed === 'パック') return 'パック';
  if (trimmed === '袋') return '袋';
  return '個';
}

function unitsEqual(a, b) {
  return !!(a && b && a.cycle === b.cycle && (a.place || '') === (b.place || ''));
}

function fallbackCycleName() {
  const { cycles } = S().masters;
  return cycles[0] || C.DEFAULT_CYCLES[0];
}

function normalizeUnit(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw.cycle) {
    const cycle = String(raw.cycle).trim();
    const place = String(raw.place || '').trim();
    if (!cycle || place === C.REMOVED_LOCATION || C.CATEGORY_PLACE_NAMES.has(place)) return null;
    return { cycle, place };
  }
  if (typeof raw === 'string') {
    const parsed = parseUnitKey(raw);
    if (parsed) return parsed;
    const place = raw.trim();
    if (!place || place === C.REMOVED_LOCATION || C.CATEGORY_PLACE_NAMES.has(place)) return null;
    return { cycle: fallbackCycleName(), place };
  }
  return null;
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
  const { checkUnits } = S().masters;
  let units = [];
  if (Array.isArray(item.checkUnits)) units = item.checkUnits.map(normalizeUnit).filter(Boolean);
  else if (item.location && !C.CATEGORY_PLACE_NAMES.has(item.location)) {
    const one = normalizeUnit(item.location);
    if (one) units = [one];
  }
  units = dedupeUnits(units).filter(u => checkUnits.some(master => unitsEqual(master, u)));
  return units;
}

function setItemCheckUnits(item, units) {
  const { checkUnits } = S().masters;
  const next = dedupeUnits((units || []).map(normalizeUnit).filter(Boolean))
    .filter(u => checkUnits.some(master => unitsEqual(master, u)));
  item.checkUnits = next;
  item.location = item.checkUnits[0] ? item.checkUnits[0].place : '';
}

function allUnits() {
  const { units } = S().masters;
  return collectUniqueNames(units, S().stockItems.map(item => item.unit), value => String(value || '').trim());
}

function rememberUnit(name) {
  CheckStock.masters.ensureUnit(name);
}

function itemMatchesCyclePlace(item, cycleFilter, placeFilter) {
  const units = itemCheckUnits(item);
  if (!units.length) {
    return cycleFilter === C.ALL_FILTER && (placeFilter === C.ALL_FILTER || placeFilter === C.UNSET_PLACE_FILTER);
  }
  return units.some(u =>
    (cycleFilter === C.ALL_FILTER || u.cycle === cycleFilter) &&
    (placeFilter === C.ALL_FILTER || (placeFilter === C.UNSET_PLACE_FILTER ? !u.place : u.place === placeFilter))
  );
}

function itemMatchesCategory(item, categoryFilter) {
  if (categoryFilter === C.ALL_FILTER) return true;
  const category = normalizeCategory(item.category);
  if (categoryFilter === C.UNSET_CATEGORY_LABEL) return !category;
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
    if (C.CATEGORY_PLACE_NAMES.has(place)) {
      if (!categoryFromPlaces) categoryFromPlaces = place;
      if (cycle) units.push({ cycle, place: '' });
      return;
    }
    const normalized = normalizeUnit(raw);
    if (normalized) units.push(normalized);
  });
  if (!Array.isArray(item.checkUnits) && next.location && !C.CATEGORY_PLACE_NAMES.has(next.location)) {
    const one = normalizeUnit(next.location);
    if (one) units = [one];
  }
  if (C.CATEGORY_PLACE_NAMES.has(String(next.location || '').trim()) && !categoryFromPlaces) {
    categoryFromPlaces = String(next.location).trim();
  }
  next.category = normalizeCategory(next.category) || categoryFromPlaces;
  if (next.category) CheckStock.masters.ensureCategory(next.category);
  units = dedupeUnits(units);
  units.forEach(u => CheckStock.masters.ensureCheckUnit(u.cycle, u.place));
  next.checkUnits = units;
  next.location = units[0] ? units[0].place : '';
  next.complete = !!(next.entered && next.count > next.orderThreshold);
  if (!isItemUuid(next.id)) next.id = newItemId();
  return next;
}

function findItemById(id) {
  const key = String(id);
  return S().stockItems.find(i => String(i.id) === key);
}

CheckStock.items = {
  isItemUuid,
  newItemId,
  unitKey,
  parseUnitKey,
  placeLabel,
  normalizeCategory,
  collectUniqueNames,
  allCategories,
  settingsCategoryNames,
  canonicalizeStockUnit,
  unitsEqual,
  fallbackCycleName,
  normalizeUnit,
  dedupeUnits,
  todayIsoDate,
  normalizeDate,
  formatLastOrder,
  itemCheckUnits,
  setItemCheckUnits,
  allUnits,
  rememberUnit,
  itemMatchesCyclePlace,
  itemMatchesCategory,
  needsOrder,
  isComplete,
  syncItemFlags,
  migrateItem,
  findItemById
};

var I = CheckStock.items;
