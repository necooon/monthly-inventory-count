function initSupabase() {
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    S().sync.supabaseClient = null;
    return false;
  }
  try {
    S().sync.supabaseClient = supabase.createClient(C.SUPABASE_CONFIG.url, C.SUPABASE_CONFIG.anonKey);
    return true;
  } catch (e) {
    console.error('Supabase init failed', e);
    S().sync.supabaseClient = null;
    return false;
  }
}

function isCloudReady() {
  return !!S().sync.supabaseClient;
}

function scheduleCloudSave() {
  const sync = S().sync;
  if (sync.applyingRemote || sync.skipScheduledCloudSave || !isCloudReady()) return;
  clearTimeout(sync.syncTimer);
  sync.syncTimer = setTimeout(pushToCloud, 400);
}

async function flushCloudSave() {
  if (!isCloudReady()) return true;
  const sync = S().sync;
  clearTimeout(sync.syncTimer);
  sync.syncTimer = null;
  const ok = await pushToCloud();
  if (!ok) alert('クラウドへの保存に失敗しました。接続を確認してください。');
  return ok;
}

function scheduleCloudPull() {
  const sync = S().sync;
  if (sync.applyingRemote || !isCloudReady()) return;
  if (sync.cloudPushInProgress) {
    sync.pullAfterPush = true;
    return;
  }
  clearTimeout(sync.pullTimer);
  sync.pullTimer = setTimeout(pullFromCloud, 250);
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
      category: I.normalizeCategory(item.category),
      count: item.count,
      checkUnits: I.itemCheckUnits(item),
      target: item.target,
      orderThreshold: item.orderThreshold,
      unit: item.unit,
      entered: !!item.entered,
      lastOrderedOn: I.normalizeDate(item.lastOrderedOn)
    }))
  });
}

function localCloudSnapshot() {
  const st = S();
  return cloudStateSnapshot({
    cycles: st.masters.cycles,
    places: st.masters.places,
    categories: st.masters.categories,
    units: st.masters.units,
    checkUnits: st.masters.checkUnits,
    items: st.stockItems
  });
}

function stateFromCloudRows(cycleRows, locRows, checkUnitRows, categoryRows, stockUnitRows, itemRows, memberships) {
  const cycleNames = (cycleRows || []).map(row => row.name).filter(Boolean);
  const cycles = cycleNames.length ? cycleNames : [...C.DEFAULT_CYCLES];
  const cycleIdToName = Object.fromEntries((cycleRows || []).map(row => [row.id, row.name]));
  const placeNames = (locRows || []).map(loc => loc.name).filter(name => name && name !== C.REMOVED_LOCATION && !C.CATEGORY_PLACE_NAMES.has(name));
  const places = placeNames.length ? placeNames : [...C.DEFAULT_PLACES];
  const locIdToName = Object.fromEntries((locRows || []).map(loc => [loc.id, loc.name]));
  const categoryNames = (categoryRows || []).map(row => row.name).filter(Boolean);
  const categories = categoryNames.length ? categoryNames : [...C.DEFAULT_CATEGORIES];
  const unitNames = (stockUnitRows || []).map(row => row.name).filter(Boolean);
  const units = unitNames.length ? unitNames : [...C.DEFAULT_UNITS];
  const unitIdToUnit = {};
  const checkUnits = [];
  (checkUnitRows || []).forEach(row => {
    const cycle = cycleIdToName[row.cycle_id];
    if (!cycle) return;
    const place = row.location_id ? (locIdToName[row.location_id] || '') : '';
    if (place === C.REMOVED_LOCATION || C.CATEGORY_PLACE_NAMES.has(place)) return;
    const unit = { cycle, place };
    unitIdToUnit[row.id] = unit;
    if (!checkUnits.some(u => I.unitsEqual(u, unit))) checkUnits.push(unit);
  });
  const resolvedUnits = checkUnits.length
    ? checkUnits
    : places.map(place => ({ cycle: cycles[0] || C.DEFAULT_CYCLES[0], place }));
  const unitsByItem = {};
  (memberships || []).forEach(row => {
    const unit = unitIdToUnit[row.check_unit_id];
    if (!unit) return;
    const key = String(row.item_id);
    if (!unitsByItem[key]) unitsByItem[key] = [];
    if (!unitsByItem[key].some(u => I.unitsEqual(u, unit))) unitsByItem[key].push(unit);
  });
  const items = (itemRows || []).map(row => {
    const key = String(row.id);
    const fromJoin = unitsByItem[key];
    const fallbackPlace = row.location_id ? locIdToName[row.location_id] : '';
    return I.migrateItem({
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
  const client = S().sync.supabaseClient;
  const { data: cycleRows, error: cycleError } = await client
    .from('cycles')
    .select('id,name,sort_order')
    .order('sort_order');
  if (cycleError) throw cycleError;

  const { data: locs, error: locError } = await client
    .from('locations')
    .select('id,name,sort_order')
    .order('sort_order');
  if (locError) throw locError;

  const { data: categoryRows, error: categoryError } = await client
    .from('categories')
    .select('id,name,sort_order')
    .order('sort_order');
  if (categoryError) throw categoryError;

  const { data: stockUnitRows, error: stockUnitError } = await client
    .from('units')
    .select('id,name,sort_order')
    .order('sort_order');
  if (stockUnitError) throw stockUnitError;

  const { data: checkUnitRows, error: checkUnitError } = await client
    .from('check_units')
    .select('id,cycle_id,location_id,sort_order')
    .order('sort_order');
  if (checkUnitError) throw checkUnitError;

  const { data: rows, error: itemError } = await client
    .from('items')
    .select('id,name,count,target_qty,order_threshold,unit,entered,location_id,last_ordered_on,category');
  if (itemError) throw itemError;

  let memberships = [];
  const { data: membershipRows, error: membershipError } = await client
    .from('item_check_units')
    .select('item_id,check_unit_id');
  if (!membershipError) memberships = membershipRows || [];

  if (!(cycleRows || []).length && !(rows || []).length) return null;

  return stateFromCloudRows(cycleRows, locs, checkUnitRows, categoryRows, stockUnitRows, rows, memberships);
}

function applyFetchedState(state) {
  const st = S();
  st.sync.applyingRemote = true;
  st.masters.cycles = state.cycles.length ? state.cycles : [...C.DEFAULT_CYCLES];
  st.masters.places = (state.places.length ? state.places : [...C.DEFAULT_PLACES]).filter(name => !C.CATEGORY_PLACE_NAMES.has(name));
  st.masters.checkUnits = (state.checkUnits.length ? state.checkUnits : st.masters.places.map(place => ({
    cycle: st.masters.cycles[0] || C.DEFAULT_CYCLES[0],
    place
  }))).filter(u => !C.CATEGORY_PLACE_NAMES.has(u.place));
  st.masters.categories = (state.categories && state.categories.length ? state.categories : [...C.DEFAULT_CATEGORIES]);
  st.masters.units = [...C.DEFAULT_UNITS];
  st.stockItems = state.items.map(I.migrateItem);
  st.stockItems.forEach(item => {
    if (item.category) M.ensureCategory(item.category);
    if (item.unit) M.ensureUnit(item.unit);
  });
  CheckStock.storage.persistMasters();
  renderFilters();
  saveAndRender();
  st.sync.applyingRemote = false;
}

async function upsertNamedRows(table, rows, onConflict) {
  const client = S().sync.supabaseClient;
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict });
  if (!error) return;
  for (const row of rows) {
    let finder = client.from(table).select('id');
    if (row.name != null) {
      finder = finder.eq('name', row.name);
    } else if (row.cycle_id != null) {
      finder = finder.eq('cycle_id', row.cycle_id);
      finder = row.location_id == null ? finder.is('location_id', null) : finder.eq('location_id', row.location_id);
    } else {
      const { error: insertError } = await client.from(table).insert(row);
      if (insertError && insertError.code !== '23505') throw insertError;
      continue;
    }
    const { data: existing, error: findError } = await finder.maybeSingle();
    if (findError) throw findError;
    if (existing) {
      const { error: updateError } = await client.from(table).update(row).eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await client.from(table).insert(row);
      if (insertError && insertError.code !== '23505') throw insertError;
    }
  }
}

async function purgeRemovedCloudMasters(cycleRows, locs, cloudCategories, cloudStockUnits, cloudUnits) {
  const st = S();
  const client = st.sync.supabaseClient;
  const localUnitKeys = new Set(st.masters.checkUnits.map(I.unitKey));

  const extraUnitIds = (cloudUnits || []).filter(row => {
    const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
    if (!cycle || !st.masters.cycles.includes(cycle.name)) return true;
    const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
    if (loc && !st.masters.places.includes(loc.name)) return true;
    const place = loc ? loc.name : '';
    return !localUnitKeys.has(I.unitKey({ cycle: cycle.name, place }));
  }).map(row => row.id);
  if (extraUnitIds.length) {
    await client.from('item_check_units').delete().in('check_unit_id', extraUnitIds);
    const { error: unitDeleteError } = await client.from('check_units').delete().in('id', extraUnitIds);
    if (unitDeleteError) throw unitDeleteError;
  }

  const extraCycleIds = (cycleRows || [])
    .filter(row => !st.masters.cycles.includes(row.name))
    .map(row => row.id);
  if (extraCycleIds.length) {
    const { data: dropUnits } = await client
      .from('check_units')
      .select('id')
      .in('cycle_id', extraCycleIds);
    const dropUnitIds = (dropUnits || []).map(row => row.id);
    if (dropUnitIds.length) {
      await client.from('item_check_units').delete().in('check_unit_id', dropUnitIds);
      await client.from('check_units').delete().in('id', dropUnitIds);
    }
    const { error: cycleDeleteError } = await client.from('cycles').delete().in('id', extraCycleIds);
    if (cycleDeleteError) throw cycleDeleteError;
  }

  const extraLocIds = (locs || [])
    .filter(loc => !st.masters.places.includes(loc.name))
    .map(loc => loc.id);
  if (extraLocIds.length) {
    const { error: itemLocClearError } = await client
      .from('items')
      .update({ location_id: null })
      .in('location_id', extraLocIds);
    if (itemLocClearError) throw itemLocClearError;
    const { data: locDropUnits } = await client
      .from('check_units')
      .select('id')
      .in('location_id', extraLocIds);
    const locDropUnitIds = (locDropUnits || []).map(row => row.id);
    if (locDropUnitIds.length) {
      await client.from('item_check_units').delete().in('check_unit_id', locDropUnitIds);
    }
    await client.from('check_units').delete().in('location_id', extraLocIds);
    const { error: locDeleteError } = await client.from('locations').delete().in('id', extraLocIds);
    if (locDeleteError) throw locDeleteError;
  }

  const extraCategoryIds = (cloudCategories || [])
    .filter(row => !st.masters.categories.includes(row.name))
    .map(row => row.id);
  if (extraCategoryIds.length) {
    const { error: categoryDeleteError } = await client.from('categories').delete().in('id', extraCategoryIds);
    if (categoryDeleteError) throw categoryDeleteError;
  }

  const extraStockUnitIds = (cloudStockUnits || [])
    .filter(row => !st.masters.units.includes(row.name))
    .map(row => row.id);
  if (extraStockUnitIds.length) {
    const { error: stockUnitDeleteError } = await client.from('units').delete().in('id', extraStockUnitIds);
    if (stockUnitDeleteError) throw stockUnitDeleteError;
  }
}

async function pushToCloud() {
  if (!isCloudReady()) return false;
  const st = S();
  const client = st.sync.supabaseClient;
  st.sync.cloudPushInProgress = true;
  try {
    const { count: cloudItemCount, error: cloudCountError } = await client
      .from('items')
      .select('id', { count: 'exact', head: true });
    if (!cloudCountError && cloudItemCount != null && st.stockItems.length < 20 && cloudItemCount > Math.max(st.stockItems.length * 2, 10)) {
      console.error('skip cloud save: local catalog is much smaller than cloud');
      return false;
    }
    const [
      { data: preCycleRows, error: preCycleReadError },
      { data: preLocs, error: preLocReadError },
      { data: preCategories, error: preCategoryReadError },
      { data: preStockUnits, error: preStockUnitReadError },
      { data: preCheckUnits, error: preCheckUnitReadError }
    ] = await Promise.all([
      client.from('cycles').select('id,name'),
      client.from('locations').select('id,name'),
      client.from('categories').select('id,name'),
      client.from('units').select('id,name'),
      client.from('check_units').select('id,cycle_id,location_id')
    ]);
    if (preCycleReadError) throw preCycleReadError;
    if (preLocReadError) throw preLocReadError;
    if (preCategoryReadError) throw preCategoryReadError;
    if (preStockUnitReadError) throw preStockUnitReadError;
    if (preCheckUnitReadError) throw preCheckUnitReadError;

    await purgeRemovedCloudMasters(preCycleRows, preLocs, preCategories, preStockUnits, preCheckUnits);

    await upsertNamedRows('cycles', st.masters.cycles.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    await upsertNamedRows('locations', st.masters.places.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    await upsertNamedRows('categories', st.masters.categories.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    await upsertNamedRows('units', st.masters.units.map((name, index) => ({
      name,
      sort_order: index
    })), 'name');

    const { data: cycleRows, error: cycleReadError } = await client
      .from('cycles')
      .select('id,name');
    if (cycleReadError) throw cycleReadError;
    const cycleNameToId = Object.fromEntries((cycleRows || []).map(row => [row.name, row.id]));

    const { data: locs, error: locReadError } = await client
      .from('locations')
      .select('id,name');
    if (locReadError) throw locReadError;
    const nameToId = Object.fromEntries((locs || []).map(loc => [loc.name, loc.id]));

    const placedRows = st.masters.checkUnits.map((unit, index) => ({
      cycle_id: cycleNameToId[unit.cycle],
      location_id: unit.place ? nameToId[unit.place] : null,
      sort_order: index
    })).filter(row => row.cycle_id && row.location_id);
    await upsertNamedRows('check_units', placedRows, 'cycle_id,location_id');

    for (const unit of st.masters.checkUnits.filter(u => u.cycle && !u.place)) {
      const cycleId = cycleNameToId[unit.cycle];
      if (!cycleId) continue;
      const { data: existingNull } = await client
        .from('check_units')
        .select('id')
        .eq('cycle_id', cycleId)
        .is('location_id', null)
        .maybeSingle();
      if (!existingNull) {
        const { error: nullInsertError } = await client.from('check_units').insert({
          cycle_id: cycleId,
          location_id: null,
          sort_order: 0
        });
        if (nullInsertError && nullInsertError.code !== '23505') throw nullInsertError;
      }
    }

    const { data: cloudUnits, error: unitReadError } = await client
      .from('check_units')
      .select('id,cycle_id,location_id');
    if (unitReadError) throw unitReadError;
    const unitKeyToId = {};
    (cloudUnits || []).forEach(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle) return;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      const place = loc ? loc.name : '';
      unitKeyToId[I.unitKey({ cycle: cycle.name, place })] = row.id;
    });

    st.stockItems.forEach(item => {
      if (!I.isItemUuid(item.id)) item.id = I.newItemId();
    });
    const itemRows = st.stockItems.map(item => {
      const units = I.itemCheckUnits(item);
      const firstPlaced = units.find(u => u.place);
      return {
        id: String(item.id),
        location_id: (firstPlaced && nameToId[firstPlaced.place]) || null,
        category: I.normalizeCategory(item.category),
        name: item.name,
        count: item.count,
        target_qty: item.target,
        order_threshold: item.orderThreshold,
        unit: item.unit || '個',
        entered: !!item.entered,
        last_ordered_on: I.normalizeDate(item.lastOrderedOn),
        updated_at: new Date().toISOString()
      };
    });
    if (itemRows.length) {
      const { error: itemUpsertError } = await client
        .from('items')
        .upsert(itemRows, { onConflict: 'id' });
      if (itemUpsertError) throw itemUpsertError;
    }

    const { data: cloudItems, error: itemReadError } = await client
      .from('items')
      .select('id');
    if (itemReadError) throw itemReadError;
    const localIds = new Set(st.stockItems.map(item => String(item.id)));
    const extraItemIds = (cloudItems || []).map(row => row.id).filter(id => !localIds.has(String(id)));

    const membershipRows = [];
    st.stockItems.forEach(item => {
      I.itemCheckUnits(item).forEach(unit => {
        const checkUnitId = unitKeyToId[I.unitKey(unit)];
        if (!checkUnitId) return;
        membershipRows.push({
          item_id: String(item.id),
          check_unit_id: checkUnitId
        });
      });
    });
    const { error: membershipClearError } = await client
      .from('item_check_units')
      .delete()
      .not('item_id', 'is', null);
    if (membershipClearError && membershipClearError.code !== '42P01' && membershipClearError.code !== 'PGRST205') {
      throw membershipClearError;
    }
    if (!membershipClearError && membershipRows.length) {
      const { error: membershipInsertError } = await client
        .from('item_check_units')
        .insert(membershipRows);
      if (membershipInsertError) throw membershipInsertError;
    }
    if (extraItemIds.length) {
      const { error: itemDeleteError } = await client.from('items').delete().in('id', extraItemIds);
      if (itemDeleteError) throw itemDeleteError;
    }

    const localUnitKeys = new Set(st.masters.checkUnits.map(I.unitKey));
    const extraUnitIds = (cloudUnits || []).filter(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle || !st.masters.cycles.includes(cycle.name)) return true;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      if (loc && !st.masters.places.includes(loc.name)) return true;
      const place = loc ? loc.name : '';
      return !localUnitKeys.has(I.unitKey({ cycle: cycle.name, place }));
    }).map(row => row.id);
    if (extraUnitIds.length) {
      await client.from('item_check_units').delete().in('check_unit_id', extraUnitIds);
      const { error: unitDeleteError } = await client.from('check_units').delete().in('id', extraUnitIds);
      if (unitDeleteError) throw unitDeleteError;
    }

    return true;
  } catch (e) {
    console.error('cloud save failed', e);
    return false;
  } finally {
    const sync = S().sync;
    sync.cloudPushInProgress = false;
    if (sync.pullAfterPush) {
      sync.pullAfterPush = false;
      scheduleCloudPull();
    }
  }
}

async function pullFromCloud() {
  if (!isCloudReady()) return;
  const sync = S().sync;
  const epoch = sync.localSyncEpoch;
  try {
    const state = await fetchCloudState();
    if (epoch !== sync.localSyncEpoch) return;
    if (!state) {
      await pushToCloud();
      return;
    }
    if (cloudStateSnapshot(state) === localCloudSnapshot()) {
      return;
    }
    if (epoch !== sync.localSyncEpoch) return;
    applyFetchedState(state);
  } catch (e) {
    console.error('cloud load failed', e);
  }
}

async function startCloudListener() {
  const sync = S().sync;
  if (sync.syncUnsub) {
    sync.syncUnsub();
    sync.syncUnsub = null;
  }
  if (!isCloudReady()) {
    sync.cloudHydrated = true;
    return;
  }

  await pullFromCloud();
  sync.cloudHydrated = true;

  const client = sync.supabaseClient;
  const channel = client
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

  sync.syncUnsub = () => {
    client.removeChannel(channel);
  };
}
