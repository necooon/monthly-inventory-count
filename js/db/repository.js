async function fetchOrderedMaster(client, table) {
  const { data, error } = await client.from(table).select('id,name,sort_order').order('sort_order');
  if (error) throw error;
  return data || [];
}

function isMissingColumnError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204') return true;
  const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  return /schema cache|column .* does not exist|could not find .* column/i.test(text);
}

async function selectWithFallback(query, fallbackQuery) {
  const preferred = await query();
  if (!preferred.error) return preferred;
  if (!isMissingColumnError(preferred.error)) return preferred;
  return fallbackQuery();
}

async function fetchPurchaseDestinations(client) {
  const result = await selectWithFallback(
    () => client.from('purchase_destinations').select('id,name,sort_order,kind').order('sort_order'),
    () => client.from('purchase_destinations').select('id,name,sort_order').order('sort_order')
  );
  if (result.error) throw result.error;
  return result.data || [];
}

const ITEM_COLUMNS = 'id,name,count,target_qty,order_threshold,unit,entered,location_id,last_ordered_on,category,purchase_destinations,pending_mode,pending_dest,pending_qty';
const ITEM_COLUMNS_FALLBACK = 'id,name,count,target_qty,order_threshold,unit,entered,location_id,last_ordered_on,category,purchase_destinations';

async function deleteExtraNamedRows(client, table, cloudRows, localNames) {
  const extraIds = (cloudRows || [])
    .filter(row => !localNames.includes(row.name))
    .map(row => row.id);
  if (!extraIds.length) return;
  const { error } = await client.from(table).delete().in('id', extraIds);
  if (error) throw error;
}

const DbRepository = {
  async fetchCloudState() {
    const client = getSupabaseClient();

    const [cycleRows, locs, categoryRows, destRows, stockUnitRows] = await Promise.all([
      fetchOrderedMaster(client, 'cycles'),
      fetchOrderedMaster(client, 'locations'),
      fetchOrderedMaster(client, 'categories'),
      fetchPurchaseDestinations(client),
      fetchOrderedMaster(client, 'units')
    ]);

    const { data: checkUnitRows, error: checkUnitError } = await client
      .from('check_units')
      .select('id,cycle_id,location_id,sort_order')
      .order('sort_order');
    if (checkUnitError) throw checkUnitError;

    const preferredItems = await client.from('items').select(ITEM_COLUMNS);
    let itemSelect = preferredItems;
    let itemPendingFromDb = !preferredItems.error;
    if (preferredItems.error && isMissingColumnError(preferredItems.error)) {
      itemSelect = await client.from('items').select(ITEM_COLUMNS_FALLBACK);
      itemPendingFromDb = false;
    }
    const { data: rows, error: itemError } = itemSelect;
    if (itemError) throw itemError;

    const { data: membershipRows, error: membershipError } = await client
      .from('item_check_units')
      .select('item_id,check_unit_id');
    if (membershipError) throw membershipError;
    const memberships = membershipRows || [];

    if (!(cycleRows || []).length && !(rows || []).length) return null;

    const state = DbMapper.stateFromCloudRows(cycleRows, locs, checkUnitRows, categoryRows, stockUnitRows, rows, memberships, destRows);
    if (state) state.itemPendingFromDb = !!itemPendingFromDb;
    return state;
  },

  async fetchMasterSnapshots() {
    const client = getSupabaseClient();
    const [
      { data: cycleRows, error: cycleError },
      { data: locs, error: locError },
      { data: categories, error: categoryError },
      { data: purchaseDests, error: destError },
      { data: stockUnits, error: stockUnitError },
      { data: checkUnits, error: checkUnitError }
    ] = await Promise.all([
      client.from('cycles').select('id,name'),
      client.from('locations').select('id,name'),
      client.from('categories').select('id,name'),
      client.from('purchase_destinations').select('id,name'),
      client.from('units').select('id,name'),
      client.from('check_units').select('id,cycle_id,location_id')
    ]);
    if (cycleError) throw cycleError;
    if (locError) throw locError;
    if (categoryError) throw categoryError;
    if (destError) throw destError;
    if (stockUnitError) throw stockUnitError;
    if (checkUnitError) throw checkUnitError;
    return { cycleRows, locs, categories, purchaseDests, stockUnits, checkUnits };
  },

  async countItems() {
    const client = getSupabaseClient();
    return client.from('items').select('id', { count: 'exact', head: true });
  },

  async upsertNamedRows(table, rows, onConflict) {
    if (!rows.length) return;
    const client = getSupabaseClient();
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
  },

  async deleteCheckUnitsByIds(unitIds) {
    if (!unitIds.length) return;
    const client = getSupabaseClient();
    await client.from('item_check_units').delete().in('check_unit_id', unitIds);
    const { error } = await client.from('check_units').delete().in('id', unitIds);
    if (error) throw error;
  },

  async deleteOrphanCheckUnits(cloudUnits, cycleRows, locs, localUnitKeys) {
    const extraUnitIds = DbMapper.findOrphanCheckUnitIds(
      cloudUnits, cycleRows, locs, localUnitKeys, customCycles, customPlaces
    );
    await DbRepository.deleteCheckUnitsByIds(extraUnitIds);
  },

  async purgeRemovedCloudMasters(cycleRows, locs, cloudCategories, cloudPurchaseDests, cloudStockUnits, cloudUnits) {
    const client = getSupabaseClient();
    const localUnitKeys = new Set(customCheckUnits.map(unitKey));

    await DbRepository.deleteOrphanCheckUnits(cloudUnits, cycleRows, locs, localUnitKeys);

    const extraCycleIds = (cycleRows || [])
      .filter(row => !customCycles.includes(row.name))
      .map(row => row.id);
    if (extraCycleIds.length) {
      const { data: dropUnits } = await client
        .from('check_units')
        .select('id')
        .in('cycle_id', extraCycleIds);
      await DbRepository.deleteCheckUnitsByIds((dropUnits || []).map(row => row.id));
      const { error: cycleDeleteError } = await client.from('cycles').delete().in('id', extraCycleIds);
      if (cycleDeleteError) throw cycleDeleteError;
    }

    const extraLocIds = (locs || [])
      .filter(loc => !customPlaces.includes(loc.name))
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

    await deleteExtraNamedRows(client, 'categories', cloudCategories, customCategories);
    await deleteExtraNamedRows(client, 'purchase_destinations', cloudPurchaseDests, customPurchaseDests);
    await deleteExtraNamedRows(client, 'units', cloudStockUnits, customUnits);
  },

  async upsertMasters() {
    await DbRepository.upsertNamedRows('cycles', DbMapper.namedMasterRows(customCycles), 'name');
    await DbRepository.upsertNamedRows('locations', DbMapper.namedMasterRows(customPlaces), 'name');
    await DbRepository.upsertNamedRows('categories', DbMapper.namedMasterRows(customCategories), 'name');
    try {
      await DbRepository.upsertNamedRows('purchase_destinations', DbMapper.purchaseDestMasterRows(), 'name');
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      await DbRepository.upsertNamedRows('purchase_destinations', DbMapper.namedMasterRows(customPurchaseDests), 'name');
    }
    await DbRepository.upsertNamedRows('units', DbMapper.namedMasterRows(customUnits), 'name');
  },

  async fetchCyclesAndLocations() {
    const client = getSupabaseClient();
    const { data: cycleRows, error: cycleReadError } = await client.from('cycles').select('id,name');
    if (cycleReadError) throw cycleReadError;
    const { data: locs, error: locReadError } = await client.from('locations').select('id,name');
    if (locReadError) throw locReadError;
    return {
      cycleRows,
      locs,
      cycleNameToId: Object.fromEntries((cycleRows || []).map(row => [row.name, row.id])),
      nameToId: Object.fromEntries((locs || []).map(loc => [loc.name, loc.id]))
    };
  },

  async syncCheckUnits(cycleNameToId, nameToId) {
    stockItems.forEach(item => {
      itemCheckUnits(item).forEach(unit => ensureCheckUnit(unit.cycle, unit.place));
    });

    const placedRows = DbMapper.checkUnitRows(customCheckUnits, cycleNameToId, nameToId);
    await DbRepository.upsertNamedRows('check_units', placedRows, 'cycle_id,location_id');

    const client = getSupabaseClient();
    for (const unit of customCheckUnits.filter(u => u.cycle && !u.place)) {
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
  },

  async fetchCheckUnits() {
    const client = getSupabaseClient();
    const { data: cloudUnits, error: unitReadError } = await client
      .from('check_units')
      .select('id,cycle_id,location_id');
    if (unitReadError) throw unitReadError;
    return cloudUnits || [];
  },

  async upsertItems(nameToId) {
    const client = getSupabaseClient();
    stockItems.forEach(item => {
      if (!isItemUuid(item.id)) item.id = newItemId();
    });
    const itemRows = stockItems.map(item => DbMapper.itemToDbRow(item, nameToId));
    if (!itemRows.length) return;
    const { error: itemUpsertError } = await client.from('items').upsert(itemRows, { onConflict: 'id' });
    if (!itemUpsertError) return;
    if (!isMissingColumnError(itemUpsertError)) throw itemUpsertError;
    const fallbackRows = itemRows.map(row => {
      const next = { ...row };
      delete next.pending_mode;
      delete next.pending_dest;
      delete next.pending_qty;
      return next;
    });
    const { error: fallbackError } = await client.from('items').upsert(fallbackRows, { onConflict: 'id' });
    if (fallbackError) throw fallbackError;
  },

  async syncItemMemberships(unitKeyToId) {
    const client = getSupabaseClient();
    const { membershipRows, membershipItemIds, unresolvedMemberships } = DbMapper.buildMembershipRows(stockItems, unitKeyToId);
    const expectedMemberships = stockItems.reduce((count, item) => count + itemCheckUnits(item).length, 0);
    if (expectedMemberships > 0 && membershipRows.length === 0) {
      console.error('skip membership sync: could not resolve any check_unit ids', {
        expectedMemberships,
        unresolvedMemberships,
        customCheckUnits,
        unitKeyToId
      });
      throw new Error('check_unit id resolution failed');
    }
    if (!membershipItemIds.length) return;

    const { error: membershipClearError } = await client
      .from('item_check_units')
      .delete()
      .in('item_id', membershipItemIds);
    if (membershipClearError && membershipClearError.code !== '42P01' && membershipClearError.code !== 'PGRST205') {
      throw membershipClearError;
    }
    if (!membershipClearError && membershipRows.length) {
      const { error: membershipInsertError } = await client.from('item_check_units').insert(membershipRows);
      if (membershipInsertError) throw membershipInsertError;
    }
  },

  async deleteOrphanItems() {
    const client = getSupabaseClient();
    const { data: cloudItems, error: itemReadError } = await client.from('items').select('id');
    if (itemReadError) throw itemReadError;
    const localIdSet = new Set(stockItems.map(item => String(item.id)));
    const extraItemIds = (cloudItems || []).map(row => row.id).filter(id => !localIdSet.has(String(id)));
    if (!extraItemIds.length) return;
    const { error: itemDeleteError } = await client.from('items').delete().in('id', extraItemIds);
    if (itemDeleteError) throw itemDeleteError;
  },

  async pushLocalState() {
    const { count: cloudItemCount, error: cloudCountError } = await DbRepository.countItems();
    if (!cloudCountError && cloudItemCount != null && stockItems.length < 20 && cloudItemCount > Math.max(stockItems.length * 2, 10)) {
      console.error('skip cloud save: local catalog is much smaller than cloud');
      return false;
    }

    const masters = await DbRepository.fetchMasterSnapshots();
    await DbRepository.purgeRemovedCloudMasters(
      masters.cycleRows,
      masters.locs,
      masters.categories,
      masters.purchaseDests,
      masters.stockUnits,
      masters.checkUnits
    );

    await DbRepository.upsertMasters();

    const { cycleRows, locs, cycleNameToId, nameToId } = await DbRepository.fetchCyclesAndLocations();
    await DbRepository.syncCheckUnits(cycleNameToId, nameToId);

    const cloudUnits = await DbRepository.fetchCheckUnits();
    const unitKeyToId = DbMapper.buildUnitKeyToId(cloudUnits, cycleRows, locs);

    await DbRepository.upsertItems(nameToId);
    await DbRepository.syncItemMemberships(unitKeyToId);
    await DbRepository.deleteOrphanItems();

    const localUnitKeys = new Set(customCheckUnits.map(unitKey));
    await DbRepository.deleteOrphanCheckUnits(cloudUnits, cycleRows, locs, localUnitKeys);

    return true;
  }
};
