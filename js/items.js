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
  if (!units.length && item.location && !CATEGORY_PLACE_NAMES.has(item.location)) {
    const one = normalizeUnit(item.location);
    if (one) units = [one];
  }
  units = dedupeUnits(units);
  units.forEach(u => ensureCheckUnit(u.cycle, u.place));
  return units;
}

function setItemCheckUnits(item, units) {
  const next = dedupeUnits((units || []).map(normalizeUnit).filter(Boolean));
  next.forEach(u => ensureCheckUnit(u.cycle, u.place));
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

function itemCheckStatus(item) {
  return item.entered ? 'check-done' : 'check-unentered';
}

function itemCardStatus(item) {
  const pending = itemPendingMode(item);
  if (pending) return pending;
  if (needsOrder(item)) return 'stock-empty';
  if (isComplete(item)) return 'stock-ok';
  return '';
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
  const hasStoredUnits = Array.isArray(next.checkUnits) && next.checkUnits.length > 0;
  if (!hasStoredUnits && next.location && !CATEGORY_PLACE_NAMES.has(next.location)) {
    const one = normalizeUnit(next.location);
    if (one) units = [one];
  }
  if (CATEGORY_PLACE_NAMES.has(String(next.location || '').trim()) && !categoryFromPlaces) {
    categoryFromPlaces = String(next.location).trim();
  }
  next.category = normalizeCategory(next.category) || categoryFromPlaces;
  if (next.category) ensureCategory(next.category);
  next.purchaseDests = normalizePurchaseDests(next.purchaseDests);
  next.purchaseDests.forEach(dest => ensurePurchaseDest(dest));
  next.pendingMode = itemPendingMode(next);
  next.pendingDest = next.pendingMode ? (normalizePurchaseDest(next.pendingDest) || '') : '';
  const pendingQty = Number(next.pendingQty);
  next.pendingQty = next.pendingMode && Number.isFinite(pendingQty) ? Math.max(0, Math.round(pendingQty)) : null;
  next.pendingProductId = next.pendingMode && next.pendingProductId ? String(next.pendingProductId) : '';
  if (next.pendingDest) ensurePurchaseDest(next.pendingDest);
  units = dedupeUnits(units);
  units.forEach(u => ensureCheckUnit(u.cycle, u.place));
  next.checkUnits = units;
  next.location = units[0] ? units[0].place : '';
  next.complete = !!(next.entered && next.count > next.orderThreshold);
  if (!isItemUuid(next.id)) next.id = newItemId();
  return next;
}
function findItemById(id) {
  const key = String(id);
  return stockItems.find(i => String(i.id) === key);
}