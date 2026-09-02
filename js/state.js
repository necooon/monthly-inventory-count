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

function initCheckStockState() {
  let currentPage = localStorage.getItem(StorageKeys.CURRENT_PAGE) || 'inventory';
  if (currentPage === 'items') currentPage = 'settings';
  const rawOrderView = localStorage.getItem(StorageKeys.ORDER_VIEW);
  if (currentPage === 'order' && (rawOrderView === 'shopping' || rawOrderView === 'receipt')) {
    currentPage = 'fulfillment';
  }
  if (!PAGE_IDS.includes(currentPage)) currentPage = 'inventory';

  let orderFulfillmentView = loadOrderFulfillmentView();
  if (currentPage === 'fulfillment' && orderFulfillmentView !== 'shopping' && orderFulfillmentView !== 'receipt') {
    orderFulfillmentView = 'shopping';
  }

  let customPlaces = loadNameList(StorageKeys.PLACES, loadNameList(StorageKeys.LOCATIONS, DEFAULT_PLACES));
  customPlaces = customPlaces.filter(loc => loc !== REMOVED_LOCATION && !CATEGORY_PLACE_NAMES.has(loc));
  if (customPlaces.length === 0) customPlaces = [...DEFAULT_PLACES];

  let customCheckUnits = [];

  CheckStock.state = {
    stockItems: [],
    catalogProducts: [],
    purchaseHistory: [],
    masters: {
      cycles: migrateCycleNames(loadNameList(StorageKeys.CYCLES, DEFAULT_CYCLES)),
      places: customPlaces,
      categories: loadNameList(StorageKeys.CATEGORIES, DEFAULT_CATEGORIES),
      purchaseDests: loadNameList(StorageKeys.PURCHASE_DESTS, DEFAULT_PURCHASE_DESTS),
      purchaseDestKinds: {},
      units: loadNameList(StorageKeys.UNITS, DEFAULT_UNITS),
      checkUnits: customCheckUnits
    },
    filters: {
      inventory: {
        cycle: ALL_FILTER,
        place: ALL_FILTER,
        unenteredOnly: false,
        collapsedPlaces: loadInventoryCollapsedPlaces()
      },
      catalog: {
        cycle: ALL_FILTER,
        place: ALL_FILTER,
        category: ALL_FILTER
      },
      order: {
        category: ALL_FILTER,
        purchaseDestFilter: new Set(),
        collapsedDests: loadOrderCollapsedDests(),
        lohacoStepDone: false
      },
      fulfillment: { view: orderFulfillmentView }
    },
    ui: {
      currentPage,
      selectedItemId: null,
      editingItemId: null,
      settingsOpenSections: loadSettingsOpenSections(),
      lastOrderUndo: null,
      undoToastTimer: null
    },
    sync: {
      applyingRemote: false,
      supabaseClient: null,
      syncUnsub: null,
      syncTimer: null,
      pullTimer: null,
      cloudPushInProgress: false,
      pullAfterPush: false,
      skipScheduledCloudSave: false,
      localSyncEpoch: 0,
      cloudHydrated: false
    }
  };
}

function bindPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  const key = parts[parts.length - 1];
  return {
    get() { return cur[key]; },
    set(v) { cur[key] = v; }
  };
}

function bindGlobalState() {
  const s = CheckStock.state;
  const bindings = {
    stockItems: 'stockItems',
    catalogProducts: 'catalogProducts',
    purchaseHistory: 'purchaseHistory',
    customCycles: 'masters.cycles',
    customPlaces: 'masters.places',
    customCategories: 'masters.categories',
    customPurchaseDests: 'masters.purchaseDests',
    purchaseDestKinds: 'masters.purchaseDestKinds',
    customUnits: 'masters.units',
    customCheckUnits: 'masters.checkUnits',
    inventoryCycleFilter: 'filters.inventory.cycle',
    inventoryPlaceFilter: 'filters.inventory.place',
    inventoryUnenteredOnly: 'filters.inventory.unenteredOnly',
    inventoryCollapsedPlaces: 'filters.inventory.collapsedPlaces',
    catalogCycleFilter: 'filters.catalog.cycle',
    catalogPlaceFilter: 'filters.catalog.place',
    catalogCategoryFilter: 'filters.catalog.category',
    orderCategoryFilter: 'filters.order.category',
    orderPurchaseDestFilter: 'filters.order.purchaseDestFilter',
    orderCollapsedDests: 'filters.order.collapsedDests',
    orderLohacoStepDone: 'filters.order.lohacoStepDone',
    orderFulfillmentView: 'filters.fulfillment.view',
    currentPage: 'ui.currentPage',
    selectedItemId: 'ui.selectedItemId',
    editingItemId: 'ui.editingItemId',
    settingsOpenSections: 'ui.settingsOpenSections',
    lastOrderUndo: 'ui.lastOrderUndo',
    undoToastTimer: 'ui.undoToastTimer',
    applyingRemote: 'sync.applyingRemote',
    syncUnsub: 'sync.syncUnsub',
    syncTimer: 'sync.syncTimer',
    pullTimer: 'sync.pullTimer',
    cloudPushInProgress: 'sync.cloudPushInProgress',
    pullAfterPush: 'sync.pullAfterPush',
    skipScheduledCloudSave: 'sync.skipScheduledCloudSave',
    localSyncEpoch: 'sync.localSyncEpoch',
    cloudHydrated: 'sync.cloudHydrated'
  };
  Object.entries(bindings).forEach(([globalName, statePath]) => {
    const accessor = bindPath(s, statePath);
    Object.defineProperty(window, globalName, {
      get: accessor.get,
      set: accessor.set,
      configurable: true,
      enumerable: true
    });
  });
}

function bootstrapAppData() {
  customCheckUnits = loadCheckUnitMaster().filter(u => !CATEGORY_PLACE_NAMES.has(u.place));
  CheckStock.state.masters.checkUnits = customCheckUnits;
  purchaseDestKinds = loadPurchaseDestKinds();
  CheckStock.state.masters.purchaseDestKinds = purchaseDestKinds;
  stockItems = loadItems(DEFAULT_STOCK_ITEMS);
  stockItems = stockItems.map(migrateItem);
  migrateLegacyCycleNames();
  stockItems = stockItems.map(migrateItem);
  catalogProducts = (loadJson(StorageKeys.PRODUCTS, []) || []).map(migrateProduct);
  purchaseHistory = (loadJson(StorageKeys.HISTORY, []) || []).map(migrateHistory);
  purchaseHistory.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  persistItems(stockItems);
  stockItems.forEach(item => rememberUnit(item.unit));
  persistMasters();
}

initCheckStockState();
bindGlobalState();
bootstrapAppData();
