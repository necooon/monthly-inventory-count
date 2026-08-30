const DbMapper = {
  cloudStateSnapshot(state) {
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
  },

  localCloudSnapshot() {
    return DbMapper.cloudStateSnapshot({
      cycles: customCycles,
      places: customPlaces,
      categories: customCategories,
      units: customUnits,
      checkUnits: customCheckUnits,
      items: stockItems
    });
  },

  stateFromCloudRows(cycleRows, locRows, checkUnitRows, categoryRows, stockUnitRows, itemRows, memberships) {
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
      const itemCheckUnitsList = fromJoin && fromJoin.length
        ? fromJoin
        : (fallbackPlace ? [{ cycle: cycles[0] || DEFAULT_CYCLES[0], place: fallbackPlace }] : []);
      return migrateItem({
        id: row.id,
        name: row.name,
        category: row.category,
        count: row.count,
        location: fallbackPlace,
        checkUnits: itemCheckUnitsList,
        target: row.target_qty,
        orderThreshold: row.order_threshold,
        unit: row.unit,
        entered: row.entered,
        lastOrderedOn: row.last_ordered_on
      });
    });
    return { cycles, places, categories, units, checkUnits: resolvedUnits, items };
  },

  itemToDbRow(item, nameToId) {
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
    stockItems.forEach(item => {
      const itemId = String(item.id);
      const rows = [];
      const units = itemCheckUnits(item);
      units.forEach(unit => {
        const checkUnitId = unitKeyToId[unitKey(unit)];
        if (!checkUnitId) return;
        rows.push({ item_id: itemId, check_unit_id: checkUnitId });
      });
      const hasPlacedUnits = units.some(unit => unit.place);
      if (rows.length || !hasPlacedUnits) {
        membershipRows.push(...rows);
        membershipItemIds.push(itemId);
      }
    });
    return { membershipRows, membershipItemIds };
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

  checkUnitRows(customCheckUnits, cycleNameToId, nameToId) {
    return customCheckUnits.map((unit, index) => ({
      cycle_id: cycleNameToId[unit.cycle],
      location_id: unit.place ? nameToId[unit.place] : null,
      sort_order: index
    })).filter(row => row.cycle_id && row.location_id);
  }
};
