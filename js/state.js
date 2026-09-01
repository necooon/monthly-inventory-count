let currentPage = localStorage.getItem('currentPage') || 'inventory';
if (currentPage === 'items') currentPage = 'settings';
if (!C.PAGE_IDS.includes(currentPage)) currentPage = 'inventory';

CheckStock.state = {
  stockItems: [],
  masters: {
    cycles: [],
    places: [],
    categories: [],
    units: [...C.DEFAULT_UNITS],
    checkUnits: []
  },
  filters: {
    inventory: {
      cycle: C.ALL_FILTER,
      place: C.ALL_FILTER,
      unenteredOnly: false,
      collapsedPlaces: new Set()
    },
    catalog: {
      cycle: C.ALL_FILTER,
      place: C.ALL_FILTER,
      category: C.ALL_FILTER
    },
    order: {
      category: C.ALL_FILTER
    }
  },
  ui: {
    currentPage,
    selectedItemId: null,
    editingItemId: null,
    settingsOpenSections: new Set(['items']),
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

var S = function () { return CheckStock.state; };
