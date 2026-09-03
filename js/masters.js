function namedItemMaster(spec) {
  return {
    addTitle: spec.addTitle,
    renameTitle: spec.renameTitle,
    deleteExtra: spec.deleteExtra,
    uniqueNames: spec.uniqueNames || spec.getList,
    moveList: spec.moveList || spec.getList,
    setList: spec.setList,
    ensure: spec.ensure,
    usageCount: spec.usageCount,
    applyRename: (oldName, next) => {
      const list = spec.getList();
      if (!list.includes(oldName)) list.push(oldName);
      const idx = list.indexOf(oldName);
      if (idx < 0) return false;
      list[idx] = next;
      spec.setList(list);
      spec.rewriteItems(oldName, next);
      if (spec.afterRename) spec.afterRename(oldName, next);
      return true;
    },
    applyDelete: name => {
      spec.setList(spec.getList().filter(v => v !== name));
      spec.rewriteItems(name, '');
      if (spec.afterDelete) spec.afterDelete(name);
      return true;
    }
  };
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

function unitsEqual(a, b) {
  return !!(a && b && a.cycle === b.cycle && (a.place || '') === (b.place || ''));
}

function fallbackCycleName() {
  return customCycles[0] || DEFAULT_CYCLES[0];
}

function migrateLegacyCycleNames() {
  customCycles = [...new Set(customCycles.map(normalizeCycleName))];
  customCheckUnits = dedupeUnits(customCheckUnits.map(unit => ({
    cycle: normalizeCycleName(unit.cycle),
    place: unit.place
  })));
  stockItems.forEach(item => {
    if (!Array.isArray(item.checkUnits)) return;
    item.checkUnits = item.checkUnits.map(unit => ({
      cycle: normalizeCycleName(unit.cycle),
      place: unit.place
    }));
  });
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
  const parsed = loadJson(StorageKeys.CHECK_UNITS, null);
  if (Array.isArray(parsed) && parsed.length) {
    const units = parsed.map(normalizeUnit).filter(Boolean);
    if (units.length) return dedupeUnits(units);
  }
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
  category: namedItemMaster({
    addTitle: '新しいカテゴリの名前を入力してください',
    renameTitle: 'カテゴリの新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムは未分類になります。` : '',
    getList: () => customCategories,
    setList: list => { customCategories = list; },
    ensure: name => ensureCategory(name),
    uniqueNames: () => customCategories,
    moveList: () => allCategories(),
    usageCount: name => stockItems.filter(item => normalizeCategory(item.category) === name).length,
    rewriteItems: (oldName, next) => {
      stockItems.forEach(item => {
        if (normalizeCategory(item.category) === oldName) item.category = next;
      });
    },
    afterRename: (oldName, next) => {
      catalogCategoryFilter = remapNamedFilter(catalogCategoryFilter, oldName, next);
      orderCategoryFilter = remapNamedFilter(orderCategoryFilter, oldName, next);
    },
    afterDelete: name => {
      catalogCategoryFilter = remapNamedFilter(catalogCategoryFilter, name, ALL_FILTER);
      orderCategoryFilter = remapNamedFilter(orderCategoryFilter, name, ALL_FILTER);
    }
  }),
  purchaseDest: namedItemMaster({
    addTitle: '新しい購入先の名前を入力してください',
    renameTitle: '購入先の新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムからこの購入先が外れます。` : '',
    getList: () => customPurchaseDests,
    setList: list => { customPurchaseDests = list; },
    ensure: name => ensurePurchaseDest(name),
    uniqueNames: () => allPurchaseDests(),
    moveList: () => allPurchaseDests(),
    usageCount: name => stockItems.filter(item => itemPurchaseDests(item).includes(name)).length,
    rewriteItems: (oldName, next) => {
      stockItems.forEach(item => {
        const dests = itemPurchaseDests(item);
        item.purchaseDests = next
          ? dests.map(dest => dest === oldName ? next : dest)
          : dests.filter(dest => dest !== oldName);
      });
      rewritePendingDest(oldName, next);
      if (next) {
        purchaseDestKinds[next] = purchaseDestKinds[oldName] || destKind(oldName);
      }
      delete purchaseDestKinds[oldName];
    },
    afterRename: (oldName, next) => {
      if (orderCollapsedDests.has(oldName)) {
        orderCollapsedDests.delete(oldName);
        orderCollapsedDests.add(next);
        persistOrderCollapsedDests();
      }
    },
    afterDelete: name => {
      if (orderCollapsedDests.has(name)) {
        orderCollapsedDests.delete(name);
        persistOrderCollapsedDests();
      }
    }
  }),
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
  if (kind === 'purchaseDest' && typeof pickPurchaseDestKind === 'function') {
    const chosen = await pickPurchaseDestKind();
    setPurchaseDestKind(trimmed, chosen || 'store');
  }
  await persistAndFlushCloud();
  return trimmed;
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
