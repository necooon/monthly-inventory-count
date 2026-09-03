const DbMapper = {
  cloudStateSnapshot(state) {
    return JSON.stringify({
      cycles: state.cycles,
      places: state.places,
      categories: state.categories,
      purchaseDests: state.purchaseDests,
      purchaseDestKinds: state.purchaseDestKinds || Object.fromEntries((state.purchaseDests || []).map(name => [name, destKind(name)])),
      units: state.units,
      checkUnits: state.checkUnits.map(u => ({ cycle: u.cycle, place: u.place })),
      products: (state.products || []).map(p => ({
        id: String(p.id),
        itemId: String(p.itemId || ''),
        name: p.name,
        purchaseDests: normalizePurchaseDests(p.purchaseDests),
        url: p.url || '',
        barcode: p.barcode || ''
      })),
      history: (state.history || []).map(row => ({
        id: String(row.id),
        at: row.at,
        itemId: String(row.itemId || ''),
        itemName: row.itemName,
        productId: String(row.productId || ''),
        productName: row.productName,
        dest: row.dest,
        qty: row.qty,
        mode: row.mode
      })),
      items: state.items.map(item => ({
        id: String(item.id),
        name: item.name,
        category: normalizeCategory(item.category),
        purchaseDests: normalizePurchaseDests(item.purchaseDests),
        count: item.count,
        checkUnits: itemCheckUnits(item),
        target: item.target,
        orderThreshold: item.orderThreshold,
        unit: item.unit,
        entered: !!item.entered,
        lastOrderedOn: normalizeDate(item.lastOrderedOn),
        pendingProductId: item.pendingProductId || '',
        ...itemSyncPending(item)
      }))
    });
  },

  localSnapshot() {
    const s = CheckStock.state;
    return {
      cycles: s.masters.cycles,
      places: s.masters.places,
      categories: s.masters.categories,
      purchaseDests: s.masters.purchaseDests,
      purchaseDestKinds: s.masters.purchaseDestKinds,
      units: s.masters.units,
      checkUnits: s.masters.checkUnits,
      products: s.catalogProducts,
      history: s.purchaseHistory,
      items: s.stockItems
    };
  },

  localCloudSnapshot() {
    return DbMapper.cloudStateSnapshot(DbMapper.localSnapshot());
  },

  stateFromCloudRows(cycleRows, locRows, checkUnitRows, categoryRows, stockUnitRows, itemRows, memberships, destRows) {
    const cycleNames = (cycleRows || []).map(row => row.name).filter(Boolean);
    const cycles = cycleNames.length ? cycleNames : [...DEFAULT_CYCLES];
    const cycleIdToName = Object.fromEntries((cycleRows || []).map(row => [row.id, row.name]));
    const placeNames = (locRows || []).map(loc => loc.name).filter(name => name && name !== REMOVED_LOCATION && !CATEGORY_PLACE_NAMES.has(name));
    const places = placeNames.length ? placeNames : [...DEFAULT_PLACES];
    const locIdToName = Object.fromEntries((locRows || []).map(loc => [loc.id, loc.name]));
    const categoryNames = (categoryRows || []).map(row => row.name).filter(Boolean);
    const categories = categoryNames.length ? categoryNames : [...DEFAULT_CATEGORIES];
    const destNames = (destRows || []).map(row => row.name).filter(Boolean);
    const purchaseDests = destNames.length ? destNames : [...DEFAULT_PURCHASE_DESTS];
    const { purchaseDestKinds, purchaseDestKindsFromDb: destKindColumn } = DbMapper.kindsFromDestRows(destRows, purchaseDests);
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
      const defaultCycle = cycles[0] || DEFAULT_CYCLES[0];
      let itemCheckUnitsList = fromJoin && fromJoin.length ? fromJoin : [];
      if (!itemCheckUnitsList.length) {
        itemCheckUnitsList = fallbackPlace
          ? [{ cycle: defaultCycle, place: fallbackPlace }]
          : [{ cycle: defaultCycle, place: '' }];
      }
      return migrateItem({
        id: row.id,
        name: row.name,
        category: row.category,
        purchaseDests: row.purchase_destinations,
        count: row.count,
        location: fallbackPlace,
        checkUnits: itemCheckUnitsList,
        target: row.target_qty,
        orderThreshold: row.order_threshold,
        unit: row.unit,
        entered: row.entered,
        lastOrderedOn: row.last_ordered_on,
        pendingMode: row.pending_mode,
        pendingDest: row.pending_dest,
        pendingQty: row.pending_qty,
        pendingProductId: row.pending_product_id
      });
    });
    return {
      cycles,
      places,
      categories,
      purchaseDests,
      purchaseDestKinds,
      purchaseDestKindsFromDb: destKindColumn,
      units,
      checkUnits: resolvedUnits,
      items
    };
  },

  productFromRow(row) {
    return migrateProduct({
      id: row.id,
      itemId: row.item_id,
      name: row.name,
      purchaseDests: row.purchase_destinations,
      url: row.url,
      barcode: row.barcode
    });
  },

  historyFromRow(row) {
    return migrateHistory({
      id: row.id,
      at: row.happened_at,
      itemId: row.item_id,
      itemName: row.item_name,
      productId: row.product_id,
      productName: row.product_name,
      dest: row.dest,
      qty: row.qty,
      mode: row.mode
    });
  },

  itemToDbRow(item, nameToId) {
    const units = itemCheckUnits(item);
    const firstPlaced = units.find(u => u.place);
    const pending = itemSyncPending(item);
    return {
      id: String(item.id),
      location_id: (firstPlaced && nameToId[firstPlaced.place]) || null,
      category: normalizeCategory(item.category),
      purchase_destinations: normalizePurchaseDests(item.purchaseDests),
      name: item.name,
      count: item.count,
      target_qty: item.target,
      order_threshold: item.orderThreshold,
      unit: item.unit || '個',
      entered: !!item.entered,
      last_ordered_on: normalizeDate(item.lastOrderedOn),
      pending_mode: pending.pendingMode,
      pending_dest: pending.pendingMode ? pending.pendingDest || null : null,
      pending_qty: pending.pendingMode ? pending.pendingQty : null,
      pending_product_id: pending.pendingMode && pending.pendingProductId ? pending.pendingProductId : null,
      updated_at: new Date().toISOString()
    };
  },

  productToDbRow(product) {
    return {
      id: String(product.id),
      item_id: product.itemId || null,
      name: product.name,
      purchase_destinations: normalizePurchaseDests(product.purchaseDests),
      url: product.url || '',
      barcode: product.barcode || '',
      updated_at: new Date().toISOString()
    };
  },

  historyToDbRow(row) {
    return {
      id: String(row.id),
      happened_at: row.at,
      item_id: row.itemId || null,
      item_name: row.itemName || '',
      product_id: row.productId || null,
      product_name: row.productName || '',
      dest: row.dest || '',
      qty: row.qty || 0,
      mode: row.mode === 'receipt' ? 'receipt' : 'shopping'
    };
  },

  kindsFromDestRows(destRows, purchaseDests) {
    const purchaseDestKindsFromDb = (destRows || []).some(row => row && Object.prototype.hasOwnProperty.call(row, 'kind'));
    const kindByName = {};
    (destRows || []).forEach(row => {
      if (row && row.name) kindByName[row.name] = row.kind;
    });
    const purchaseDestKinds = {};
    purchaseDests.forEach(name => {
      purchaseDestKinds[name] = purchaseDestKindsFromDb
        ? normalizeDestKind(kindByName[name], name)
        : defaultKindForDest(name);
    });
    return { purchaseDestKinds, purchaseDestKindsFromDb };
  },

  buildUnitKeyToId(cloudUnits, cycleRows, locs) {
    const unitKeyToId = {};
    (cloudUnits || []).forEach(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle) return;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      const place = loc ? loc.name : '';
      unitKeyToId[unitKey({ cycle: cycle.name, place })] = row.id;
    });
    return unitKeyToId;
  },

  buildMembershipRows(stockItems, unitKeyToId) {
    const membershipRows = [];
    const membershipItemIds = [];
    let unresolvedMemberships = 0;
    stockItems.forEach(item => {
      const itemId = String(item.id);
      const rows = [];
      const units = itemCheckUnits(item);
      units.forEach(unit => {
        const checkUnitId = unitKeyToId[unitKey(unit)];
        if (!checkUnitId) {
          unresolvedMemberships += 1;
          console.warn('check_unit not found for membership sync', unitKey(unit), unit);
          return;
        }
        rows.push({ item_id: itemId, check_unit_id: checkUnitId });
      });
      const hasPlacedUnits = units.some(unit => unit.place);
      if (rows.length || !hasPlacedUnits) {
        membershipRows.push(...rows);
        membershipItemIds.push(itemId);
      }
    });
    return { membershipRows, membershipItemIds, unresolvedMemberships };
  },

  findOrphanCheckUnitIds(cloudUnits, cycleRows, locs, localUnitKeys, customCycles, customPlaces) {
    return (cloudUnits || []).filter(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle || !customCycles.includes(cycle.name)) return true;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      if (loc && !customPlaces.includes(loc.name)) return true;
      const place = loc ? loc.name : '';
      return !localUnitKeys.has(unitKey({ cycle: cycle.name, place }));
    }).map(row => row.id);
  },

  namedMasterRows(names) {
    return names.map((name, index) => ({ name, sort_order: index }));
  },

  purchaseDestMasterRows(snapshot) {
    const dests = (snapshot || DbMapper.localSnapshot()).purchaseDests;
    return dests.map((name, index) => ({
      name,
      sort_order: index,
      kind: destKind(name)
    }));
  },

  checkUnitRows(checkUnits, cycleNameToId, nameToId) {
    return checkUnits.map((unit, index) => ({
      cycle_id: cycleNameToId[unit.cycle],
      location_id: unit.place ? nameToId[unit.place] : null,
      sort_order: index
    })).filter(row => row.cycle_id && row.location_id);
  }
};
