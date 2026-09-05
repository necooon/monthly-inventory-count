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

function normalizeMasterName(value, unsetLabel) {
  const name = String(value || '').trim();
  if (!name || name === unsetLabel) return '';
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
  (primary || []).forEach(push);
  (extras || []).forEach(push);
  return names;
}

function sortNamesByMaster(keys, order) {
  return [...keys].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    const sa = ia < 0 ? 999 : ia;
    const sb = ib < 0 ? 999 : ib;
    return sa - sb || a.localeCompare(b, 'ja');
  });
}

function normalizeCategory(value) {
  return normalizeMasterName(value, UNSET_CATEGORY_LABEL);
}

function allCategories() {
  return collectUniqueNames(customCategories, stockItems.map(item => item.category), normalizeCategory);
}

function ensureCategory(name) {
  const trimmed = normalizeCategory(name);
  if (!trimmed) return '';
  return ensureName(customCategories, trimmed);
}

function normalizePurchaseDest(value) {
  return normalizeMasterName(value, UNSET_PURCHASE_DEST_LABEL);
}

function rawNameList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === '') return [];
  return String(raw).split(',');
}

function normalizePurchaseDests(raw) {
  return collectUniqueNames([], rawNameList(raw), normalizePurchaseDest);
}

function allPurchaseDests() {
  return collectUniqueNames(
    customPurchaseDests,
    stockItems.flatMap(item => item.purchaseDests || []),
    normalizePurchaseDest
  );
}

function defaultKindForDest(name) {
  return String(name || '').trim() === LOHACO_DEST_NAME ? 'online' : 'store';
}

function normalizeDestKind(value, destName) {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'online' || kind === 'store') return kind;
  return defaultKindForDest(destName);
}

function destKind(name) {
  const trimmed = normalizePurchaseDest(name);
  if (!trimmed) return 'store';
  const stored = purchaseDestKinds[trimmed];
  if (stored === 'online' || stored === 'store') return stored;
  return defaultKindForDest(trimmed);
}

function destKindLabel(name) {
  return destKind(name) === 'online' ? 'ネット' : '店舗';
}

function productPurchaseDestNames(product) {
  return product ? normalizePurchaseDests(product.purchaseDests) : [];
}

function formatPurchaseDestList(dests) {
  const names = normalizePurchaseDests(dests);
  if (!names.length) return '購入先なし';
  return names.map(name => `${name}（${destKindLabel(name)}）`).join('、');
}

function setPurchaseDestKind(name, kind) {
  const trimmed = normalizePurchaseDest(name);
  if (!trimmed) return;
  purchaseDestKinds[trimmed] = normalizeDestKind(kind, trimmed);
}

function loadPurchaseDestKinds() {
  const parsed = loadJson(StorageKeys.PURCHASE_DEST_KINDS, null);
  const map = {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.keys(parsed).forEach(rawName => {
      const key = normalizePurchaseDest(rawName);
      if (!key) return;
      map[key] = normalizeDestKind(parsed[rawName], key);
    });
  }
  customPurchaseDests.forEach(name => {
    if (!map[name]) map[name] = defaultKindForDest(name);
  });
  return map;
}

function ensurePurchaseDest(name, kind) {
  const trimmed = normalizePurchaseDest(name);
  if (!trimmed) return '';
  const added = !customPurchaseDests.includes(trimmed);
  ensureName(customPurchaseDests, trimmed);
  if (kind) setPurchaseDestKind(trimmed, kind);
  else if (added && purchaseDestKinds[trimmed] == null) {
    purchaseDestKinds[trimmed] = defaultKindForDest(trimmed);
  }
  return trimmed;
}

function rewritePendingDest(oldName, nextName) {
  stockItems.forEach(item => {
    if (normalizePurchaseDest(item.pendingDest) !== oldName) return;
    item.pendingDest = nextName || '';
  });
  catalogProducts.forEach(product => {
    product.purchaseDests = product.purchaseDests.map(dest => dest === oldName ? nextName : dest).filter(Boolean);
    product.purchaseDests = normalizePurchaseDests(product.purchaseDests);
  });
}

function itemPendingMode(item) {
  const mode = item && item.pendingMode;
  return mode === 'shopping' || mode === 'receipt' ? mode : null;
}

function itemOrderQty(item) {
  const pending = itemPendingMode(item);
  if (pending && item.pendingQty != null && item.pendingQty !== '') {
    const qty = Number(item.pendingQty);
    if (Number.isFinite(qty) && qty >= 0) return Math.round(qty);
  }
  return Math.max(0, Number(item.target || 0) - Number(item.count || 0));
}

function needsOrderAction(item) {
  return needsOrder(item) && !itemPendingMode(item);
}

function itemSyncPending(item) {
  const mode = itemPendingMode(item);
  if (!mode) return { pendingMode: null, pendingDest: '', pendingQty: null, pendingProductId: '' };
  return {
    pendingMode: mode,
    pendingDest: normalizePurchaseDest(item.pendingDest) || '',
    pendingQty: itemOrderQty(item),
    pendingProductId: String(item.pendingProductId || '')
  };
}

function captureFulfillment(item) {
  return {
    id: item.id,
    count: item.count,
    entered: item.entered,
    lastOrderedOn: item.lastOrderedOn,
    pendingMode: item.pendingMode || null,
    pendingDest: item.pendingDest || '',
    pendingQty: item.pendingQty == null ? null : item.pendingQty,
    pendingProductId: item.pendingProductId || '',
    historyId: null
  };
}

function restoreFulfillment(item, snap) {
  item.count = snap.count;
  item.entered = snap.entered;
  item.lastOrderedOn = snap.lastOrderedOn;
  item.pendingMode = snap.pendingMode;
  item.pendingDest = snap.pendingDest;
  item.pendingQty = snap.pendingQty;
  item.pendingProductId = snap.pendingProductId || '';
  if (snap.historyId) {
    purchaseHistory = purchaseHistory.filter(row => String(row.id) !== String(snap.historyId));
  }
}

function clearItemPending(item) {
  item.pendingMode = null;
  item.pendingDest = '';
  item.pendingQty = null;
  item.pendingProductId = '';
}

function completeItemFulfillment(item) {
  const mode = itemPendingMode(item);
  const qty = itemOrderQty(item);
  const product = findProductById(item.pendingProductId);
  const row = migrateHistory({
    id: newItemId(),
    at: new Date().toISOString(),
    itemId: item.id,
    itemName: item.name,
    productId: product ? product.id : '',
    productName: product ? product.name : '',
    dest: normalizePurchaseDest(item.pendingDest) || '',
    qty,
    mode: mode || 'shopping'
  });
  purchaseHistory.unshift(row);
  item.lastOrderedOn = todayIsoDate();
  clearItemPending(item);
  return row.id;
}

function queueItemFulfillment(item, dest, productId) {
  const mode = destKind(dest) === 'online' ? 'receipt' : 'shopping';
  item.pendingMode = mode;
  item.pendingDest = dest === UNSET_PURCHASE_DEST_LABEL ? '' : (normalizePurchaseDest(dest) || '');
  item.pendingQty = Math.max(0, Number(item.target || 0) - Number(item.count || 0));
  item.pendingProductId = productId ? String(productId) : '';
  return mode;
}

function lohacoProductsForItem(item) {
  return productsForItem(item.id).filter(productHasLohaco);
}

function lohacoProductIdForItem(item) {
  const matches = lohacoProductsForItem(item);
  return matches.length === 1 ? String(matches[0].id) : '';
}

function productHasLohaco(product) {
  if (productPurchaseDestNames(product).includes(LOHACO_DEST_NAME)) return true;
  return typeof inferPurchaseDestFromUrl === 'function'
    && inferPurchaseDestFromUrl(product && product.url) === LOHACO_DEST_NAME;
}

function itemCanBuyOnLohaco(item) {
  if (!item) return false;
  if (itemPurchaseDests(item).includes(LOHACO_DEST_NAME)) return true;
  return productsForItem(item.id).some(productHasLohaco);
}

function shoppingListDestForItem(item) {
  const dests = itemPurchaseDests(item);
  const store = dests.find(name => destKind(name) === 'store');
  if (store) return store;
  return dests.find(name => name !== LOHACO_DEST_NAME) || '';
}

function selectDestForItem(item) {
  if (itemCanBuyOnLohaco(item)) return LOHACO_DEST_NAME;
  const dests = itemPurchaseDests(item);
  if (!dests.length) return UNSET_PURCHASE_DEST_LABEL;
  const order = allPurchaseDests();
  return dests.slice().sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, 'ja');
  })[0];
}

function pendingDestLabel(item) {
  return normalizePurchaseDest(item.pendingDest) || UNSET_PURCHASE_DEST_LABEL;
}

function selectDestSortOrder() {
  const rest = allPurchaseDests().filter(name => name !== LOHACO_DEST_NAME);
  return [LOHACO_DEST_NAME, ...rest, UNSET_PURCHASE_DEST_LABEL];
}

function undoSnapshots(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function fulfillmentCounts() {
  return {
    order: stockItems.filter(needsOrderAction).length,
    shopping: stockItems.filter(item => itemPendingMode(item) === 'shopping').length,
    receipt: stockItems.filter(item => itemPendingMode(item) === 'receipt').length
  };
}

function itemsMatchingOrderCategory() {
  return stockItems.filter(item => itemMatchesCategory(item, orderCategoryFilter));
}

function itemsForLohacoSelect() {
  return itemsMatchingOrderCategory().filter(needsOrderAction);
}

function itemsForFulfillmentView(view) {
  const items = view === 'receipt'
    ? stockItems.filter(item => itemMatchesCyclePlace(item, ALL_FILTER, pickupPlaceFilter))
    : itemsMatchingOrderCategory();
  return items.filter(item => itemPendingMode(item) === view);
}

function addItemToDestCategoryGroup(destGroups, dest, item) {
  if (!destGroups.has(dest)) destGroups.set(dest, new Map());
  const cats = destGroups.get(dest);
  const cat = normalizeCategory(item.category) || UNSET_CATEGORY_LABEL;
  if (!cats.has(cat)) cats.set(cat, []);
  cats.get(cat).push(item);
}

function destCategoryGroupCount(cats) {
  return [...cats.values()].reduce((n, list) => n + list.length, 0);
}

function sortItemsByNameJa(items) {
  return items.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
}

function groupItemsByDest(items, destForItem) {
  const destGroups = new Map();
  items.forEach(item => addItemToDestCategoryGroup(destGroups, destForItem(item), item));
  return destGroups;
}

function itemPurchaseDests(item) {
  return normalizePurchaseDests(item && item.purchaseDests);
}

