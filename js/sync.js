function scheduleCloudSave() {
  if (applyingRemote || skipScheduledCloudSave || !isCloudReady()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToCloud, 400);
}

async function flushCloudSave() {
  if (!isCloudReady()) return true;
  clearTimeout(syncTimer);
  syncTimer = null;
  const ok = await pushToCloud();
  if (!ok) alert('クラウドへの保存に失敗しました。接続を確認してください。');
  return ok;
}

function scheduleCloudPull() {
  if (applyingRemote || !isCloudReady()) return;
  if (cloudPushInProgress) {
    pullAfterPush = true;
    return;
  }
  clearTimeout(pullTimer);
  pullTimer = setTimeout(pullFromCloud, 250);
}

function applyFetchedState(state) {
  applyingRemote = true;
  customCycles = migrateCycleNames(state.cycles.length ? state.cycles : [...DEFAULT_CYCLES]);
  customPlaces = (state.places.length ? state.places : [...DEFAULT_PLACES]).filter(name => !CATEGORY_PLACE_NAMES.has(name));
  customCheckUnits = (state.checkUnits.length ? state.checkUnits : customPlaces.map(place => ({
    cycle: customCycles[0] || DEFAULT_CYCLES[0],
    place
  }))).filter(u => !CATEGORY_PLACE_NAMES.has(u.place));
  customCategories = (state.categories && state.categories.length ? state.categories : [...DEFAULT_CATEGORIES]);
  customPurchaseDests = (state.purchaseDests && state.purchaseDests.length ? state.purchaseDests : [...DEFAULT_PURCHASE_DESTS]);
  if (state.purchaseDestKindsFromDb && state.purchaseDestKinds) {
    purchaseDestKinds = { ...state.purchaseDestKinds };
  } else {
    const nextKinds = { ...purchaseDestKinds };
    customPurchaseDests.forEach(name => {
      if (!nextKinds[name]) nextKinds[name] = (state.purchaseDestKinds && state.purchaseDestKinds[name]) || defaultKindForDest(name);
    });
    purchaseDestKinds = nextKinds;
  }
  customUnits = (state.units && state.units.length ? state.units : [...DEFAULT_UNITS]);
  stockItems = state.items.map(migrateItem);
  migrateLegacyCycleNames();
  stockItems = stockItems.map(migrateItem);
  stockItems.forEach(item => {
    if (item.category) ensureCategory(item.category);
    itemPurchaseDests(item).forEach(dest => ensurePurchaseDest(dest));
    if (item.unit) ensureUnit(item.unit);
  });
  persistMasters();
  renderFilters();
  saveAndRender();
  applyingRemote = false;
}

async function pushToCloud() {
  if (!isCloudReady()) return false;
  cloudPushInProgress = true;
  try {
    return await DbRepository.pushLocalState();
  } catch (e) {
    console.error('cloud save failed', e);
    return false;
  } finally {
    cloudPushInProgress = false;
    if (pullAfterPush) {
      pullAfterPush = false;
      scheduleCloudPull();
    }
  }
}

async function pullFromCloud() {
  if (!isCloudReady()) return;
  const epoch = localSyncEpoch;
  try {
    const state = await DbRepository.fetchCloudState();
    if (epoch !== localSyncEpoch) return;
    if (!state) {
      await pushToCloud();
      return;
    }
    if (!state.purchaseDestKindsFromDb) {
      const merged = { ...purchaseDestKinds };
      (state.purchaseDests || []).forEach(name => {
        if (!merged[name]) merged[name] = defaultKindForDest(name);
      });
      state.purchaseDestKinds = merged;
    }
    if (DbMapper.cloudStateSnapshot(state) === DbMapper.localCloudSnapshot()) {
      return;
    }
    if (epoch !== localSyncEpoch) return;
    applyFetchedState(state);
  } catch (e) {
    console.error('cloud load failed', e);
  }
}

const SYNC_TABLES = ['items', 'locations', 'item_check_units', 'cycles', 'check_units', 'categories', 'purchase_destinations', 'units'];

async function startCloudListener() {
  if (syncUnsub) {
    syncUnsub();
    syncUnsub = null;
  }
  if (!isCloudReady()) {
    cloudHydrated = true;
    return;
  }

  await pullFromCloud();
  cloudHydrated = true;

  const client = getSupabaseClient();
  let channel = client.channel('app-sync');
  SYNC_TABLES.forEach(table => {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => { scheduleCloudPull(); }
    );
  });
  channel.subscribe();

  syncUnsub = () => {
    client.removeChannel(channel);
  };
}
