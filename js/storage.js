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

function loadCheckUnitMaster() {
  try {
    const parsed = JSON.parse(localStorage.getItem('stockCheckUnits'));
    if (Array.isArray(parsed) && parsed.length) {
      const units = parsed.map(I.normalizeUnit).filter(Boolean);
      if (units.length) return I.dedupeUnits(units);
    }
  } catch (e) { /* ignore */ }
  return S().masters.places.map(place => ({ cycle: I.fallbackCycleName(), place }));
}

function loadInventoryCollapsedPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem('inventoryCollapsedPlaces'));
    if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  } catch (e) { /* ignore */ }
  return new Set();
}

function loadSettingsOpenSections() {
  try {
    const parsed = JSON.parse(localStorage.getItem('settingsOpenSections'));
    if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  } catch (e) { /* ignore */ }
  return new Set(['items']);
}

function persistMasters() {
  const m = S().masters;
  localStorage.setItem('stockCycles', JSON.stringify(m.cycles));
  localStorage.setItem('stockPlaces', JSON.stringify(m.places));
  localStorage.setItem('stockLocations', JSON.stringify(m.places));
  localStorage.setItem('stockCategories', JSON.stringify(m.categories));
  localStorage.setItem('stockUnits', JSON.stringify(m.units));
  localStorage.setItem('stockCheckUnits', JSON.stringify(m.checkUnits));
}

function persistInventoryCollapsedPlaces() {
  localStorage.setItem('inventoryCollapsedPlaces', JSON.stringify([...S().filters.inventory.collapsedPlaces]));
}

function persistSettingsOpenSections() {
  localStorage.setItem('settingsOpenSections', JSON.stringify([...S().ui.settingsOpenSections]));
}

function persistLocalState() {
  const st = S();
  st.stockItems.forEach(I.syncItemFlags);
  localStorage.setItem('monthlyStockWithLocation', JSON.stringify(st.stockItems));
  persistMasters();
  if (st.sync.applyingRemote) return;
  if (typeof isCloudReady === 'function' && isCloudReady() && !st.sync.cloudHydrated) return;
  st.sync.localSyncEpoch += 1;
  if (!st.sync.skipScheduledCloudSave) scheduleCloudSave();
}

function saveAndRender() {
  persistLocalState();
  renderAll();
}

async function persistAndFlushCloud() {
  S().sync.skipScheduledCloudSave = true;
  try {
    saveAndRender();
  } finally {
    S().sync.skipScheduledCloudSave = false;
  }
  await flushCloudSave();
}

function initMastersFromStorage() {
  const st = S();
  st.masters.cycles = loadNameList('stockCycles', C.DEFAULT_CYCLES);
  let places = loadNameList('stockPlaces', loadNameList('stockLocations', C.DEFAULT_PLACES));
  places = places.filter(loc => loc !== C.REMOVED_LOCATION && !C.CATEGORY_PLACE_NAMES.has(loc));
  st.masters.places = places.length ? places : [...C.DEFAULT_PLACES];
  st.masters.categories = loadNameList('stockCategories', C.DEFAULT_CATEGORIES);
  st.masters.units = loadNameList('stockUnits', C.DEFAULT_UNITS);
  if (!st.masters.units.length) st.masters.units = [...C.DEFAULT_UNITS];
  st.masters.checkUnits = loadCheckUnitMaster();
  st.masters.checkUnits = st.masters.checkUnits.filter(u => !C.CATEGORY_PLACE_NAMES.has(u.place));
  st.filters.inventory.collapsedPlaces = loadInventoryCollapsedPlaces();
  st.ui.settingsOpenSections = loadSettingsOpenSections();
}

function initStockItems() {
  const defaults = [
    { id: 1, name: 'トイレットペーパー', count: 2, location: 'トイレ', checkUnits: [{ cycle: '月単位', place: 'トイレ' }], target: 4, orderThreshold: 1, unit: '巻', entered: true },
    { id: 2, name: '洗濯洗剤', count: 1, location: '洗面所', checkUnits: [{ cycle: '月単位', place: '洗面所' }], target: 2, orderThreshold: 1, unit: '本', entered: true },
    { id: 3, name: '食器用洗剤', count: 0, location: 'キッチン', checkUnits: [{ cycle: '月単位', place: 'キッチン' }], target: 2, orderThreshold: 0, unit: '本', entered: false }
  ];
  const st = S();
  st.stockItems = JSON.parse(localStorage.getItem('monthlyStockWithLocation')) || defaults;
  st.stockItems = st.stockItems.map(I.migrateItem);
  localStorage.setItem('monthlyStockWithLocation', JSON.stringify(st.stockItems));
  st.stockItems.forEach(item => I.rememberUnit(item.unit));
  persistMasters();
}

initMastersFromStorage();
initStockItems();

CheckStock.storage = {
  loadNameList,
  loadCheckUnitMaster,
  loadInventoryCollapsedPlaces,
  loadSettingsOpenSections,
  persistMasters,
  persistInventoryCollapsedPlaces,
  persistSettingsOpenSections,
  persistLocalState,
  saveAndRender,
  persistAndFlushCloud,
  initMastersFromStorage,
  initStockItems
};

window.saveAndRender = saveAndRender;
