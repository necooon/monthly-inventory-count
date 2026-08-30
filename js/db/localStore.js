const StorageKeys = {
  ITEMS: 'monthlyStockWithLocation',
  CYCLES: 'stockCycles',
  PLACES: 'stockPlaces',
  LOCATIONS: 'stockLocations',
  CATEGORIES: 'stockCategories',
  PURCHASE_DESTS: 'stockPurchaseDests',
  UNITS: 'stockUnits',
  CHECK_UNITS: 'stockCheckUnits',
  CURRENT_PAGE: 'currentPage',
  SETTINGS_SECTIONS: 'settingsOpenSections',
  INVENTORY_COLLAPSED: 'inventoryCollapsedPlaces'
};

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed !== null && parsed !== undefined) return parsed;
  } catch (e) { /* ignore */ }
  return fallback;
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadNameList(key, fallback) {
  const parsed = loadJson(key, null);
  if (Array.isArray(parsed)) {
    const names = parsed.map(v => String(v).trim()).filter(Boolean);
    if (names.length) return names;
  }
  return [...fallback];
}

function persistMasters() {
  saveJson(StorageKeys.CYCLES, customCycles);
  saveJson(StorageKeys.PLACES, customPlaces);
  saveJson(StorageKeys.LOCATIONS, customPlaces);
  saveJson(StorageKeys.CATEGORIES, customCategories);
  saveJson(StorageKeys.PURCHASE_DESTS, customPurchaseDests);
  saveJson(StorageKeys.UNITS, customUnits);
  saveJson(StorageKeys.CHECK_UNITS, customCheckUnits);
}

function persistInventoryCollapsedPlaces() {
  saveJson(StorageKeys.INVENTORY_COLLAPSED, [...inventoryCollapsedPlaces]);
}

function persistSettingsOpenSections() {
  saveJson(StorageKeys.SETTINGS_SECTIONS, [...settingsOpenSections]);
}

function persistItems(items) {
  saveJson(StorageKeys.ITEMS, items);
}

function loadItems(fallback) {
  return loadJson(StorageKeys.ITEMS, fallback);
}

function loadInventoryCollapsedPlaces() {
  const parsed = loadJson(StorageKeys.INVENTORY_COLLAPSED, null);
  if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  return new Set();
}

function loadSettingsOpenSections() {
  const parsed = loadJson(StorageKeys.SETTINGS_SECTIONS, null);
  if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  return new Set(['items']);
}
