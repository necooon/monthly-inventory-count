function initSupabase() {
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    supabaseClient = null;
    return false;
  }
  try {
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return true;
  } catch (e) {
    console.error('Supabase init failed', e);
    supabaseClient = null;
    return false;
  }
}

function isCloudReady() {
  return !!supabaseClient;
}

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

function cloudStateSnapshot(state) {
  return JSON.stringify({
    cycles: state.cycles,
    places: state.places,
    categories: state.categories,
    units: state.units,
    checkUnits: state.checkUnits.map(u => ({ cycle: u.cycle, place: u.place })),
    items: state.items.map(item => ({
      id: String(item.id),
      name: item.name,
      category: normalizeCategory(item.category),
      count: item.count,
      checkUnits: itemCheckUnits(item),
      target: item.target,
      orderThreshold: item.orderThreshold,
      unit: item.unit,
      entered: !!item.entered,
      lastOrderedOn: normalizeDate(item.lastOrderedOn)
    }))
  });
}

function localCloudSnapshot() {
  return cloudStateSnapshot({
    cycles: customCycles,
    places: customPlaces,
    categories: customCategories,
    units: customUnits,
    checkUnits: customCheckUnits,
    items: stockItems
  });
}

function stateFromCloudRows(cycleRows, locRows, checkUnitRows, categoryRows, stockUnitRows, itemRows, memberships) {
  const cycleNames = (cycleRows || []).map(row => row.name).filter(Boolean);
  const cycles = cycleNames.length ? cycleNames : [...DEFAULT_CYCLES];
  const cycleIdToName = Object.fromEntries((cycleRows || []).map(row => [row.id, row.name]));
  const placeNames = (locRows || []).map(loc => loc.name).filter(name => name && name !== REMOVED_LOCATION && !CATEGORY_PLACE_NAMES.has(name));
  const places = placeNames.length ? placeNames : [...DEFAULT_PLACES];
  const locIdToName = Object.fromEntries((locRows || []).map(loc => [loc.id, loc.name]));
  const categoryNames = (categoryRows || []).map(row => row.name).filter(Boolean);
  const categories = categoryNames.length ? categoryNames : [...DEFAULT_CATEGORIES];
  const unitNames = (stockUnitRows || []).map(row => row.name).filter(Boolean);
  const units = unitNames.length ? unitNames : [...DEFAULT_UNITS];
  const unitIdToUnit = {};
  const checkUnits = [];
  (checkUnitRows || []).forEach(row => {
    const cycle = cycleIdToName[row.cycle_id];
    if (!cycle) return;
    const place = row.location_id ? (locIdToName[row.location_id] || '') : '';
    if (place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return;
    const unit = { cycle, place };
    unitIdToUnit[row.id] = unit;
    if (!checkUnits.some(u => unitsEqual(u, unit))) checkUnits.push(unit);
  });
  const resolvedUnits = checkUnits.length
    ? checkUnits
    : places.map(place => ({ cycle: cycles[0] || DEFAULT_CYCLES[0], place }));
  const unitsByItem = {};
  (memberships || []).forEach(row => {
    const unit = unitIdToUnit[row.check_unit_id];
    if (!unit) return;
    const key = String(row.item_id);
    if (!unitsByItem[key]) unitsByItem[key] = [];
    if (!unitsByItem[key].some(u => unitsEqual(u, unit))) unitsByItem[key].push(unit);
  });
  const items = (itemRows || []).map(row => {
    const key = String(row.id);
    const fromJoin = unitsByItem[key];
    const fallbackPlace = row.location_id ? locIdToName[row.location_id] : '';
    return migrateItem({
      id: row.id,
      name: row.name,
      category: row.category,
      count: row.count,
      location: fallbackPlace,
      checkUnits: fromJoin && fromJoin.length ? fromJoin : [],
      target: row.target_qty,
      orderThreshold: row.order_threshold,
      unit: row.unit,
      entered: row.entered,
      lastOrderedOn: row.last_ordered_on
    });
  });
  return { cycles, places, categories, units, checkUnits: resolvedUnits, items };
}

async function fetchCloudState() {
  const { data: cycleRows, error: cycleError } = await supabaseClient
    .from('cycles')
    .select('id,name,sort_order')
    .order('sort_order');
  if (cycleError) throw cycleError;

  const { data: locs, error: locError } = await supabaseClient
    .from('locations')
    .select('id,name,sort_order')
    .order('sort_order');
  if (locError) throw locError;

  const { data: categoryRows, error: categoryError } = await supabaseClient
    .from('categories')
    .select('id,name,sort_order')
    .order('sort_order');
  if (categoryError) throw categoryError;

  const { data: stockUnitRows, error: stockUnitError } = await supabaseClient
    .from('units')
    .select('id,name,sort_order')
    .order('sort_order');
  if (stockUnitError) throw stockUnitError;

  const { data: checkUnitRows, error: checkUnitError } = await supabaseClient
    .from('check_units')
    .select('id,cycle_id,location_id,sort_order')
    .order('sort_order');
  if (checkUnitError) throw checkUnitError;

  const { data: rows, error: itemError } = await supabaseClient
    .from('items')
    .select('id,name,count,target_qty,order_threshold,unit,entered,location_id,last_ordered_on,category');
  if (itemError) throw itemError;

  let memberships = [];
  const { data: membershipRows, error: membershipError } = await supabaseClient
    .from('item_check_units')
    .select('item_id,check_unit_id');
  if (!membershipError) memberships = membershipRows || [];

  if (!(cycleRows || []).length && !(rows || []).length) return null;

  return stateFromCloudRows(cycleRows, locs, checkUnitRows, categoryRows, stockUnitRows, rows, memberships);
}

function applyFetchedState(state) {
  applyingRemote = true;
  customCycles = state.cycles.length ? state.cycles : [...DEFAULT_CYCLES];
  customPlaces = (state.places.length ? state.places : [...DEFAULT_PLACES]).filter(name => !CATEGORY_PLACE_NAMES.has(name));
  customCheckUnits = (state.checkUnits.length ? state.checkUnits : customPlaces.map(place => ({
    cycle: customCycles[0] || DEFAULT_CYCLES[0],
    place
  }))).filter(u => !CATEGORY_PLACE_NAMES.has(u.place));
  customCategories = (state.categories && state.categories.length ? state.categories : [...DEFAULT_CATEGORIES]);
  customUnits = [...DEFAULT_UNITS];
  stockItems = state.items.map(migrateItem);
  stockItems.forEach(item => {
    if (item.category) ensureCategory(item.category);
    if (item.unit) ensureUnit(item.unit);
  });
  persistMasters();
  renderFilters();
  saveAndRender();
  applyingRemote = false;
}

async function upsertNamedRows(table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = await supabaseClient.from(table).upsert(rows, { onConflict });
  if (!error) return;
  for (const row of rows) {
    let finder = supabaseClient.from(table).select('id');
    if (row.name != null) {
      finder = finder.eq('name', row.name);
    } else if (row.cycle_id != null) {
      finder = finder.eq('cycle_id', row.cycle_id);
      finder = row.location_id == null ? finder.is('location_id', null) : finder.eq('location_id', row.location_id);
    } else {
      const { error: insertError } = await supabaseClient.from(table).insert(row);
      if (insertError && insertError.code !== '23505') throw insertError;
      continue;
    }
    const { data: existing, error: findError } = await finder.maybeSingle();
    if (findError) throw findError;
    if (existing) {
      const { error: updateError } = await supabaseClient.from(table).update(row).eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabaseClient.from(table).insert(row);
      if (insertError && insertError.code !== '23505') throw insertError;
    }
  }
}

async function purgeRemovedCloudMasters(cycleRows, locs, cloudCategories, cloudStockUnits, cloudUnits) {
  const localUnitKeys = new Set(customCheckUnits.map(unitKey));

  const extraUnitIds = (cloudUnits || []).filter(row => {
    const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
    if (!cycle || !customCycles.includes(cycle.name)) return true;
    const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
    if (loc && !customPlaces.includes(loc.name)) return true;
    const place = loc ? loc.name : '';
    return !localUnitKeys.has(unitKey({ cycle: cycle.name, place }));
  }).map(row => row.id);
  if (extraUnitIds.length) {
    await supabaseClient.from('item_check_units').delete().in('check_unit_id', extraUnitIds);
    const { error: unitDeleteError } = await supabaseClient.from('check_units').delete().in('id', extraUnitIds);
    if (unitDeleteError) throw unitDeleteError;
  }

  const extraCycleIds = (cycleRows || [])
    .filter(row => !customCycles.includes(row.name))
    .map(row => row.id);
  if (extraCycleIds.length) {
    const { data: dropUnits } = await supabaseClient
      .from('check_units')
      .select('id')
      .in('cycle_id', extraCycleIds);
    const dropUnitIds = (dropUnits || []).map(row => row.id);
    if (dropUnitIds.length) {
      await supabaseClient.from('item_check_units').delete().in('check_unit_id', dropUnitIds);
      await supabaseClient.from('check_units').delete().in('id', dropUnitIds);
    }
    const { error: cycleDeleteError } = await supabaseClient.from('cycles').delete().in('id', extraCycleIds);
    if (cycleDeleteError) throw cycleDeleteError;
  }

  const extraLocIds = (locs || [])
    .filter(loc => !customPlaces.includes(loc.name))
    .map(loc => loc.id);
  if (extraLocIds.length) {
    const { error: itemLocClearError } = await supabaseClient
      .from('items')
      .update({ location_id: null })
      .in('location_id', extraLocIds);
    if (itemLocClearError) throw itemLocClearError;
    const { data: locDropUnits } = await supabaseClient
      .from('check_units')
      .select('id')
      .in('location_id', extraLocIds);
    const locDropUnitIds = (locDropUnits || []).map(row => row.id);
    if (locDropUnitIds.length) {
      await supabaseClient.from('item_check_units').delete().in('check_unit_id', locDropUnitIds);
    }
    await supabaseClient.from('check_units').delete().in('location_id', extraLocIds);
    const { error: locDeleteError } = await supabaseClient.from('locations').delete().in('id', extraLocIds);
    if (locDeleteError) throw locDeleteError;
  }

  const extraCategoryIds = (cloudCategories || [])
    .filter(row => !customCategories.includes(row.name))
    .map(row => row.id);
  if (extraCategoryIds.length) {
    const { error: categoryDeleteError } = await supabaseClient.from('categories').delete().in('id', extraCategoryIds);
    if (categoryDeleteError) throw categoryDeleteError;
  }

  const extraStockUnitIds = (cloudStockUnits || [])
    .filter(row => !customUnits.includes(row.name))
    .map(row => row.id);
  if (extraStockUnitIds.length) {
    const { error: stockUnitDeleteError } = await supabaseClient.from('units').delete().in('id', extraStockUnitIds);
    if (stockUnitDeleteError) throw stockUnitDeleteError;
  }
}

async function pushToCloud() {
  if (!isCloudReady()) return false;
  cloudPushInProgress = true;
  try {
    const [
      { data: preCycleRows, error: preCycleReadError },
      { data: preLocs, error: preLocReadError },
      { data: preCategories, error: preCategoryReadError },
      { data: preStockUnits, error: preStockUnitReadError },
      { data: preCheckUnits, error: preCheckUnitReadError }
    ] = await Promise.all([
      supabaseClient.from('cycles').select('id,name'),
      supabaseClient.from('locations').select('id,name'),
      supabaseClient.from('categories').select('id,name'),
      supabaseClient.from('units').select('id,name'),
      supabaseClient.from('check_units').select('id,cycle_id,location_id')
    ]);
    if (preCycleReadError) throw preCycleReadError;
    if (preLocReadError) throw preLocReadError;
    if (preCategoryReadError) throw preCategoryReadError;
    if (preStockUnitReadError) throw preStockUnitReadError;
    if (preCheckUnitReadError) throw preCheckUnitReadError;

    await purgeRemovedCloudMasters(preCycleRows, preLocs, preCategories, preStockUnits, preCheckUnits);

    await upsertNamedRows('cycles', customCycles.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    await upsertNamedRows('locations', customPlaces.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    await upsertNamedRows('categories', customCategories.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    await upsertNamedRows('units', customUnits.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    const { data: cycleRows, error: cycleReadError } = await supabaseClient
      .from('cycles')
      .select('id,name');
    if (cycleReadError) throw cycleReadError;
    const cycleNameToId = Object.fromEntries((cycleRows || []).map(row => [row.name, row.id]));

    const { data: locs, error: locReadError } = await supabaseClient
      .from('locations')
      .select('id,name');
    if (locReadError) throw locReadError;
    const nameToId = Object.fromEntries((locs || []).map(loc => [loc.name, loc.id]));

    const placedRows = customCheckUnits.map((unit, index) => ({
      cycle_id: cycleNameToId[unit.cycle],
      location_id: unit.place ? nameToId[unit.place] : null,
      sort_order: index
    })).filter(row => row.cycle_id && row.location_id);
    await upsertNamedRows('check_units', placedRows, 'cycle_id,location_id');

    for (const unit of customCheckUnits.filter(u => u.cycle && !u.place)) {
      const cycleId = cycleNameToId[unit.cycle];
      if (!cycleId) continue;
      const { data: existingNull } = await supabaseClient
        .from('check_units')
        .select('id')
        .eq('cycle_id', cycleId)
        .is('location_id', null)
        .maybeSingle();
      if (!existingNull) {
        const { error: nullInsertError } = await supabaseClient.from('check_units').insert({
          cycle_id: cycleId,
          location_id: null,
          sort_order: 0
        });
        if (nullInsertError && nullInsertError.code !== '23505') throw nullInsertError;
      }
    }

    const { data: cloudUnits, error: unitReadError } = await supabaseClient
      .from('check_units')
      .select('id,cycle_id,location_id');
    if (unitReadError) throw unitReadError;
    const unitKeyToId = {};
    (cloudUnits || []).forEach(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle) return;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      const place = loc ? loc.name : '';
      unitKeyToId[unitKey({ cycle: cycle.name, place })] = row.id;
    });

    stockItems.forEach(item => {
      if (!isItemUuid(item.id)) item.id = newItemId();
    });
    const itemRows = stockItems.map(item => {
      const units = itemCheckUnits(item);
      const firstPlaced = units.find(u => u.place);
      return {
        id: String(item.id),
        location_id: (firstPlaced && nameToId[firstPlaced.place]) || null,
        category: normalizeCategory(item.category),
        name: item.name,
        count: item.count,
        target_qty: item.target,
        order_threshold: item.orderThreshold,
        unit: item.unit || '個',
        entered: !!item.entered,
        last_ordered_on: normalizeDate(item.lastOrderedOn),
        updated_at: new Date().toISOString()
      };
    });
    if (itemRows.length) {
      const { error: itemUpsertError } = await supabaseClient
        .from('items')
        .upsert(itemRows, { onConflict: 'id' });
      if (itemUpsertError) throw itemUpsertError;
    }

    const { data: cloudItems, error: itemReadError } = await supabaseClient
      .from('items')
      .select('id');
    if (itemReadError) throw itemReadError;
    const localIds = new Set(stockItems.map(item => String(item.id)));
    const extraItemIds = (cloudItems || []).map(row => row.id).filter(id => !localIds.has(String(id)));

    const membershipRows = [];
    stockItems.forEach(item => {
      itemCheckUnits(item).forEach(unit => {
        const checkUnitId = unitKeyToId[unitKey(unit)];
        if (!checkUnitId) return;
        membershipRows.push({
          item_id: String(item.id),
          check_unit_id: checkUnitId
        });
      });
    });
    const { error: membershipClearError } = await supabaseClient
      .from('item_check_units')
      .delete()
      .not('item_id', 'is', null);
    if (membershipClearError && membershipClearError.code !== '42P01' && membershipClearError.code !== 'PGRST205') {
      throw membershipClearError;
    }
    if (!membershipClearError && membershipRows.length) {
      const { error: membershipInsertError } = await supabaseClient
        .from('item_check_units')
        .insert(membershipRows);
      if (membershipInsertError) throw membershipInsertError;
    }
    if (extraItemIds.length) {
      const { error: itemDeleteError } = await supabaseClient.from('items').delete().in('id', extraItemIds);
      if (itemDeleteError) throw itemDeleteError;
    }

    const localUnitKeys = new Set(customCheckUnits.map(unitKey));
    const extraUnitIds = (cloudUnits || []).filter(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle || !customCycles.includes(cycle.name)) return true;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      if (loc && !customPlaces.includes(loc.name)) return true;
      const place = loc ? loc.name : '';
      return !localUnitKeys.has(unitKey({ cycle: cycle.name, place }));
    }).map(row => row.id);
    if (extraUnitIds.length) {
      await supabaseClient.from('item_check_units').delete().in('check_unit_id', extraUnitIds);
      const { error: unitDeleteError } = await supabaseClient.from('check_units').delete().in('id', extraUnitIds);
      if (unitDeleteError) throw unitDeleteError;
    }

    return true;
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
    const state = await fetchCloudState();
    if (epoch !== localSyncEpoch) return;
    if (!state) {
      await pushToCloud();
      return;
    }
    if (cloudStateSnapshot(state) === localCloudSnapshot()) {
      return;
    }
    if (epoch !== localSyncEpoch) return;
    applyFetchedState(state);
  } catch (e) {
    console.error('cloud load failed', e);
  }
}

async function startCloudListener() {
  if (syncUnsub) {
    syncUnsub();
    syncUnsub = null;
  }
  if (!isCloudReady()) {
    return;
  }

  await pullFromCloud();

  const channel = supabaseClient
    .channel('app-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'items' },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'locations' },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'item_check_units' },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cycles' },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_units' },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories' },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'units' },
      () => { scheduleCloudPull(); }
    )
    .subscribe();

  syncUnsub = () => {
    supabaseClient.removeChannel(channel);
  };
}
