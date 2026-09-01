function ensureName(list, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  if (!list.includes(trimmed)) list.push(trimmed);
  return trimmed;
}

function ensureCycle(name) {
  return ensureName(S().masters.cycles, name);
}

function ensurePlace(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed === C.REMOVED_LOCATION) return null;
  return ensureName(S().masters.places, trimmed);
}

function ensureCategory(name) {
  const trimmed = I.normalizeCategory(name);
  if (!trimmed) return '';
  return ensureName(S().masters.categories, trimmed);
}

function ensureUnit(name) {
  const trimmed = I.canonicalizeStockUnit(name);
  if (!trimmed) return null;
  return ensureName(S().masters.units, trimmed);
}

function defaultUnitName() {
  const { units } = S().masters;
  if (units.includes('個')) return '個';
  return units[0] || C.DEFAULT_UNITS[0] || '個';
}

function ensureCheckUnit(cycleName, placeName) {
  const cycle = ensureCycle(cycleName);
  if (!cycle) return null;
  const place = String(placeName || '').trim();
  if (place === C.REMOVED_LOCATION || C.CATEGORY_PLACE_NAMES.has(place)) return null;
  if (place) ensurePlace(place);
  const unit = { cycle, place };
  const { checkUnits } = S().masters;
  if (!checkUnits.some(u => I.unitsEqual(u, unit))) checkUnits.push(unit);
  return unit;
}

function rewriteCheckUnits(mapFn) {
  const st = S();
  st.masters.checkUnits = I.dedupeUnits(st.masters.checkUnits.map(mapFn).filter(Boolean));
  st.stockItems.forEach(item => {
    const next = I.dedupeUnits((item.checkUnits || []).map(mapFn).filter(Boolean));
    item.checkUnits = next;
    item.location = next[0] ? next[0].place : '';
  });
}

function remapNamedFilter(current, oldName, nextName) {
  if (current !== oldName) return current;
  return nextName || C.ALL_FILTER;
}

function isReservedPlaceName(name) {
  return name === C.REMOVED_LOCATION || C.CATEGORY_PLACE_NAMES.has(name);
}

const MASTER_KINDS = {
  cycle: {
    addTitle: '新しいチェック頻度の名前を入力してください',
    renameTitle: 'チェック頻度の新しい名前',
    minAlert: 'チェック頻度は1つ以上必要です。',
    deleteExtra: count => count ? `\n${count}件のアイテムからこのチェック頻度が外れます。` : '',
    minList: () => S().masters.cycles,
    uniqueNames: () => S().masters.cycles,
    moveList: () => S().masters.cycles,
    setList: list => { S().masters.cycles = list; },
    ensure: name => ensureCycle(name),
    usageCount: name => S().stockItems.filter(item => I.itemCheckUnits(item).some(u => u.cycle === name)).length,
    applyRename: (oldName, next) => {
      const { cycles } = S().masters;
      const idx = cycles.indexOf(oldName);
      if (idx < 0) return false;
      cycles[idx] = next;
      rewriteCheckUnits(u => u.cycle === oldName ? { cycle: next, place: u.place } : u);
      const inv = S().filters.inventory;
      const cat = S().filters.catalog;
      inv.cycle = remapNamedFilter(inv.cycle, oldName, next);
      cat.cycle = remapNamedFilter(cat.cycle, oldName, next);
      return true;
    },
    applyDelete: name => {
      const st = S();
      if (st.masters.cycles.length <= 1) return false;
      st.masters.cycles = st.masters.cycles.filter(v => v !== name);
      rewriteCheckUnits(u => u.cycle === name ? null : u);
      st.masters.checkUnits = st.masters.checkUnits.filter(u => u.cycle !== name);
      const inv = st.filters.inventory;
      const cat = st.filters.catalog;
      inv.cycle = remapNamedFilter(inv.cycle, name, C.ALL_FILTER);
      cat.cycle = remapNamedFilter(cat.cycle, name, C.ALL_FILTER);
      return true;
    }
  },
  place: {
    addTitle: '新しい場所の名前を入力してください',
    renameTitle: '場所の新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムの場所は未選択になります。` : '',
    uniqueNames: () => S().masters.places,
    moveList: () => S().masters.places,
    setList: list => { S().masters.places = list; },
    ensure: name => ensurePlace(name),
    validate: name => {
      if (!isReservedPlaceName(name)) return true;
      alert('その名前は場所に使えません。');
      return false;
    },
    usageCount: name => S().stockItems.filter(item => I.itemCheckUnits(item).some(u => u.place === name)).length,
    applyRename: (oldName, next) => {
      const st = S();
      const idx = st.masters.places.indexOf(oldName);
      if (idx < 0) return false;
      st.masters.places[idx] = next;
      const collapsed = st.filters.inventory.collapsedPlaces;
      if (collapsed.has(oldName)) {
        collapsed.delete(oldName);
        collapsed.add(next);
        CheckStock.storage.persistInventoryCollapsedPlaces();
      }
      rewriteCheckUnits(u => u.place === oldName ? { cycle: u.cycle, place: next } : u);
      st.filters.inventory.place = remapNamedFilter(st.filters.inventory.place, oldName, next);
      st.filters.catalog.place = remapNamedFilter(st.filters.catalog.place, oldName, next);
      return true;
    },
    applyDelete: name => {
      const st = S();
      st.masters.places = st.masters.places.filter(v => v !== name);
      const collapsed = st.filters.inventory.collapsedPlaces;
      if (collapsed.has(name)) {
        collapsed.delete(name);
        CheckStock.storage.persistInventoryCollapsedPlaces();
      }
      rewriteCheckUnits(u => u.place === name ? { cycle: u.cycle, place: '' } : u);
      st.masters.checkUnits = st.masters.checkUnits.filter(u => u.place !== name);
      st.filters.inventory.place = remapNamedFilter(st.filters.inventory.place, name, C.ALL_FILTER);
      st.filters.catalog.place = remapNamedFilter(st.filters.catalog.place, name, C.ALL_FILTER);
      return true;
    }
  },
  category: {
    addTitle: '新しいカテゴリの名前を入力してください',
    renameTitle: 'カテゴリの新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムは未分類になります。` : '',
    uniqueNames: () => S().masters.categories,
    moveList: () => I.settingsCategoryNames(),
    setList: list => { S().masters.categories = list; },
    ensure: name => ensureCategory(name),
    usageCount: name => S().stockItems.filter(item => I.normalizeCategory(item.category) === name).length,
    applyRename: (oldName, next) => {
      const st = S();
      if (!st.masters.categories.includes(oldName)) st.masters.categories.push(oldName);
      const idx = st.masters.categories.indexOf(oldName);
      st.masters.categories[idx] = next;
      st.stockItems.forEach(item => {
        if (I.normalizeCategory(item.category) === oldName) item.category = next;
      });
      st.filters.catalog.category = remapNamedFilter(st.filters.catalog.category, oldName, next);
      st.filters.order.category = remapNamedFilter(st.filters.order.category, oldName, next);
      return true;
    },
    applyDelete: name => {
      const st = S();
      st.masters.categories = st.masters.categories.filter(v => v !== name);
      st.stockItems.forEach(item => {
        if (I.normalizeCategory(item.category) === name) item.category = '';
      });
      st.filters.catalog.category = remapNamedFilter(st.filters.catalog.category, name, C.ALL_FILTER);
      st.filters.order.category = remapNamedFilter(st.filters.order.category, name, C.ALL_FILTER);
      return true;
    }
  },
  unit: {
    addTitle: '新しい単位を入力してください',
    renameTitle: '単位の新しい名前',
    minAlert: '単位は1つ以上必要です。',
    deleteExtra: count => count ? `\n${count}件のアイテムは「${defaultUnitName()}」になります。` : '',
    minList: () => S().masters.units,
    uniqueNames: () => I.allUnits(),
    ensure: name => ensureUnit(name),
    usageCount: name => S().stockItems.filter(item => item.unit === name).length,
    applyRename: (oldName, next) => {
      const { units } = S().masters;
      if (units.includes(oldName)) {
        units[units.indexOf(oldName)] = next;
      } else if (!units.includes(next)) {
        units.push(next);
      }
      S().stockItems.forEach(item => {
        if (item.unit === oldName) item.unit = next;
      });
      return true;
    },
    applyDelete: name => {
      const st = S();
      if (st.masters.units.length <= 1) return false;
      const fallback = st.masters.units.find(u => u !== name) || defaultUnitName();
      st.masters.units = st.masters.units.filter(v => v !== name);
      st.stockItems.forEach(item => {
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
  await CheckStock.storage.persistAndFlushCloud();
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
  await CheckStock.storage.persistAndFlushCloud();
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
  await CheckStock.storage.persistAndFlushCloud();
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
  await CheckStock.storage.persistAndFlushCloud();
}

CheckStock.masters = {
  MASTER_KINDS,
  ensureName,
  ensureCycle,
  ensurePlace,
  ensureCategory,
  ensureUnit,
  defaultUnitName,
  ensureCheckUnit,
  rewriteCheckUnits,
  isReservedPlaceName,
  addMasterName,
  renameMasterName,
  deleteMasterName,
  moveMasterName
};

window.addMasterName = addMasterName;
window.renameMasterName = renameMasterName;
window.deleteMasterName = deleteMasterName;

var M = CheckStock.masters;
