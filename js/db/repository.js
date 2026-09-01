const ITEM_COLUMNS = 'id,name,count,target_qty,order_threshold,unit,entered,location_id,last_ordered_on,category,purchase_destinations,pending_mode,pending_dest,pending_qty,pending_product_id';

async function fetchOrderedMaster(table) {
  return dbSelect(table, 'id,name,sort_order', q => q.order('sort_order'));
}

async function deleteExtraNamedRows(table, cloudRows, localNames) {
  const extraIds = (cloudRows || [])
    .filter(row => !localNames.includes(row.name))
    .map(row => row.id);
  if (!extraIds.length) return;
  await dbDelete(table, q => q.in('id', extraIds));
}

const DbRepository = {
  localState() {
    return DbMapper.localSnapshot();
  },

  async fetchCloudState() {
    const [cycleRows, locs, categoryRows, destRows, stockUnitRows, checkUnitRows, rows, memberships, productRows, historyRows] = await Promise.all([
      fetchOrderedMaster('cycles'),
      fetchOrderedMaster('locations'),
      fetchOrderedMaster('categories'),
      dbSelect('purchase_destinations', 'id,name,sort_order,kind', q => q.order('sort_order')),
      fetchOrderedMaster('units'),
      dbSelect('check_units', 'id,cycle_id,location_id,sort_order', q => q.order('sort_order')),
      dbSelect('items', ITEM_COLUMNS),
      dbSelect('item_check_units', 'item_id,check_unit_id'),
      dbSelect('products', 'id,item_id,name,purchase_destinations,url,barcode'),
      dbSelect('purchase_history', 'id,happened_at,item_id,item_name,product_id,product_name,dest,qty,mode')
    ]);
    if (!cycleRows.length && !rows.length) return null;

    const state = DbMapper.stateFromCloudRows(cycleRows, locs, checkUnitRows, categoryRows, stockUnitRows, rows, memberships, destRows);
    state.products = productRows.map(row => DbMapper.productFromRow(row));
    state.history = historyRows.map(row => DbMapper.historyFromRow(row));
    return state;
  },

  async fetchMasterSnapshots() {
    const [cycleRows, locs, categories, purchaseDests, stockUnits, checkUnits] = await Promise.all([
      dbSelect('cycles', 'id,name'),
      dbSelect('locations', 'id,name'),
      dbSelect('categories', 'id,name'),
      dbSelect('purchase_destinations', 'id,name'),
      dbSelect('units', 'id,name'),
      dbSelect('check_units', 'id,cycle_id,location_id')
    ]);
    return { cycleRows, locs, categories, purchaseDests, stockUnits, checkUnits };
  },

  async countItems() {
    const { count, error } = await getSupabaseClient().from('items').select('id', { count: 'exact', head: true });
    throwIfError(error);
    return count;
  },

  async upsertNamedRows(table, rows, onConflict) {
    if (!rows.length) return;
    try {
      await dbUpsert(table, rows, onConflict);
    } catch (error) {
      const client = getSupabaseClient();
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
        throwIfError(findError);
        if (existing) {
          await dbUpdate(table, row, q => q.eq('id', existing.id));
        } else {
          const { error: insertError } = await client.from(table).insert(row);
          if (insertError && insertError.code !== '23505') throw insertError;
        }
      }
    }
  },

  async deleteCheckUnitsByIds(unitIds) {
    if (!unitIds.length) return;
    await dbDelete('item_check_units', q => q.in('check_unit_id', unitIds));
    await dbDelete('check_units', q => q.in('id', unitIds));
  },

  async deleteOrphanCheckUnits(cloudUnits, cycleRows, locs, localUnitKeys, snapshot) {
    const local = snapshot || DbRepository.localState();
    const extraUnitIds = DbMapper.findOrphanCheckUnitIds(
      cloudUnits, cycleRows, locs, localUnitKeys, local.cycles, local.places
    );
    await DbRepository.deleteCheckUnitsByIds(extraUnitIds);
  },

  async purgeRemovedCloudMasters(cycleRows, locs, cloudCategories, cloudPurchaseDests, cloudStockUnits, cloudUnits, snapshot) {
    const local = snapshot || DbRepository.localState();
    const localUnitKeys = new Set(local.checkUnits.map(unitKey));

    await DbRepository.deleteOrphanCheckUnits(cloudUnits, cycleRows, locs, localUnitKeys, local);

    const extraCycleIds = (cycleRows || [])
      .filter(row => !local.cycles.includes(row.name))
      .map(row => row.id);
    if (extraCycleIds.length) {
      const dropUnits = await dbSelect('check_units', 'id', q => q.in('cycle_id', extraCycleIds));
      await DbRepository.deleteCheckUnitsByIds(dropUnits.map(row => row.id));
      await dbDelete('cycles', q => q.in('id', extraCycleIds));
    }

    const extraLocIds = (locs || [])
      .filter(loc => !local.places.includes(loc.name))
      .map(loc => loc.id);
    if (extraLocIds.length) {
      await dbUpdate('items', { location_id: null }, q => q.in('location_id', extraLocIds));
      const locDropUnits = await dbSelect('check_units', 'id', q => q.in('location_id', extraLocIds));
      const locDropUnitIds = locDropUnits.map(row => row.id);
      if (locDropUnitIds.length) {
        await dbDelete('item_check_units', q => q.in('check_unit_id', locDropUnitIds));
      }
      await dbDelete('check_units', q => q.in('location_id', extraLocIds));
      await dbDelete('locations', q => q.in('id', extraLocIds));
    }

    await deleteExtraNamedRows('categories', cloudCategories, local.categories);
    await deleteExtraNamedRows('purchase_destinations', cloudPurchaseDests, local.purchaseDests);
    await deleteExtraNamedRows('units', cloudStockUnits, local.units);
  },

  async upsertMasters(snapshot) {
    const local = snapshot || DbRepository.localState();
    await DbRepository.upsertNamedRows('cycles', DbMapper.namedMasterRows(local.cycles), 'name');
    await DbRepository.upsertNamedRows('locations', DbMapper.namedMasterRows(local.places), 'name');
    await DbRepository.upsertNamedRows('categories', DbMapper.namedMasterRows(local.categories), 'name');
    await DbRepository.upsertNamedRows('purchase_destinations', DbMapper.purchaseDestMasterRows(local), 'name');
    await DbRepository.upsertNamedRows('units', DbMapper.namedMasterRows(local.units), 'name');
  },

  async fetchCyclesAndLocations() {
    const cycleRows = await dbSelect('cycles', 'id,name');
    const locs = await dbSelect('locations', 'id,name');
    return {
      cycleRows,
      locs,
      cycleNameToId: Object.fromEntries(cycleRows.map(row => [row.name, row.id])),
      nameToId: Object.fromEntries(locs.map(loc => [loc.name, loc.id]))
    };
  },

  async syncCheckUnits(cycleNameToId, nameToId, snapshot) {
    const local = snapshot || DbRepository.localState();
    local.items.forEach(item => {
      itemCheckUnits(item).forEach(unit => ensureCheckUnit(unit.cycle, unit.place));
    });

    const placedRows = DbMapper.checkUnitRows(local.checkUnits, cycleNameToId, nameToId);
    await DbRepository.upsertNamedRows('check_units', placedRows, 'cycle_id,location_id');

    const client = getSupabaseClient();
    for (const unit of local.checkUnits.filter(u => u.cycle && !u.place)) {
      const cycleId = cycleNameToId[unit.cycle];
      if (!cycleId) continue;
      const { data: existingNull, error } = await client
        .from('check_units')
        .select('id')
        .eq('cycle_id', cycleId)
        .is('location_id', null)
        .maybeSingle();
      throwIfError(error);
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
    return dbSelect('check_units', 'id,cycle_id,location_id');
  },

  async upsertItems(nameToId, snapshot) {
    const local = snapshot || DbRepository.localState();
    local.items.forEach(item => {
      if (!isItemUuid(item.id)) item.id = newItemId();
    });
    const itemRows = local.items.map(item => DbMapper.itemToDbRow(item, nameToId));
    await dbUpsert('items', itemRows, 'id');
  },

  async upsertProducts(snapshot) {
    const local = snapshot || DbRepository.localState();
    local.products.forEach(product => {
      if (!isItemUuid(product.id)) product.id = newItemId();
    });
    await dbUpsert('products', local.products.map(product => DbMapper.productToDbRow(product)), 'id');
  },

  async upsertHistory(snapshot) {
    const local = snapshot || DbRepository.localState();
    await dbUpsert('purchase_history', local.history.map(row => DbMapper.historyToDbRow(row)), 'id');
  },

  async syncItemMemberships(unitKeyToId, snapshot) {
    const local = snapshot || DbRepository.localState();
    const { membershipRows, membershipItemIds, unresolvedMemberships } = DbMapper.buildMembershipRows(local.items, unitKeyToId);
    const expectedMemberships = local.items.reduce((count, item) => count + itemCheckUnits(item).length, 0);
    if (expectedMemberships > 0 && membershipRows.length === 0) {
      console.error('skip membership sync: could not resolve any check_unit ids', {
        expectedMemberships,
        unresolvedMemberships,
        customCheckUnits: local.checkUnits,
        unitKeyToId
      });
      throw new Error('check_unit id resolution failed');
    }
    if (!membershipItemIds.length) return;

    await dbDelete('item_check_units', q => q.in('item_id', membershipItemIds));
    await dbInsert('item_check_units', membershipRows);
  },

  async deleteOrphanItems(snapshot) {
    const local = snapshot || DbRepository.localState();
    const cloudItems = await dbSelect('items', 'id');
    const localIdSet = new Set(local.items.map(item => String(item.id)));
    const extraItemIds = cloudItems.map(row => row.id).filter(id => !localIdSet.has(String(id)));
    if (!extraItemIds.length) return;
    await dbDelete('items', q => q.in('id', extraItemIds));
  },

  async pushLocalState() {
    const snapshot = DbRepository.localState();
    const cloudItemCount = await DbRepository.countItems();
    if (cloudItemCount != null && snapshot.items.length < 20 && cloudItemCount > Math.max(snapshot.items.length * 2, 10)) {
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
      masters.checkUnits,
      snapshot
    );

    await DbRepository.upsertMasters(snapshot);

    const { cycleRows, locs, cycleNameToId, nameToId } = await DbRepository.fetchCyclesAndLocations();
    await DbRepository.syncCheckUnits(cycleNameToId, nameToId, snapshot);

    const cloudUnits = await DbRepository.fetchCheckUnits();
    const unitKeyToId = DbMapper.buildUnitKeyToId(cloudUnits, cycleRows, locs);

    await DbRepository.upsertItems(nameToId, snapshot);
    await DbRepository.syncItemMemberships(unitKeyToId, snapshot);
    await DbRepository.deleteOrphanItems(snapshot);
    await DbRepository.upsertProducts(snapshot);
    await DbRepository.upsertHistory(snapshot);

    const localUnitKeys = new Set(snapshot.checkUnits.map(unitKey));
    await DbRepository.deleteOrphanCheckUnits(cloudUnits, cycleRows, locs, localUnitKeys, snapshot);

    return true;
  }
};

CheckStock.db = CheckStock.db || {};
CheckStock.db.repository = DbRepository;
