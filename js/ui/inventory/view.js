function isInventoryPlaceListView() {
  return inventoryPlaceFilter === ALL_FILTER;
}

function isInventoryPlaceDetailView() {
  return currentPage === 'inventory' && !isInventoryPlaceListView();
}

function toggleInventoryView(isPlaceList) {
  const dashboard = document.getElementById('inventory-place-dashboard');
  const stockList = document.getElementById('stock-list');
  const pageInventory = document.getElementById('page-inventory');
  if (dashboard) dashboard.hidden = !isPlaceList;
  if (stockList) {
    stockList.hidden = isPlaceList;
    stockList.classList.toggle('stock-list-visible', !isPlaceList);
  }
  if (pageInventory) {
    pageInventory.classList.toggle('inventory-dashboard-view', isPlaceList);
    pageInventory.classList.toggle('inventory-detail-view', !isPlaceList);
  }
}

function prepareInventoryPlace(place) {
  inventoryPlaceFilter = place;
  inventoryCycleFilter = ALL_FILTER;
  clearInventorySearch();
}

function openInventoryPlace(place) {
  prepareInventoryPlace(place);
  saveAndRender();
}

function closeInventoryPlace() {
  inventoryPlaceFilter = ALL_FILTER;
  clearInventorySearch();
  saveAndRender();
}

function itemInventoryPlaces(item) {
  const units = itemCheckUnits(item);
  if (!units.length) return [UNSET_PLACE_FILTER];
  return [...new Set(units.map(unit => placeLabel(unit.place)))];
}

function resolveInventoryPlaceForItem(item) {
  const places = itemInventoryPlaces(item);
  if (places.includes(inventoryPlaceFilter)) return inventoryPlaceFilter;
  return places[0];
}

function highlightScannedInventoryItem(itemId) {
  const card = document.getElementById(`inventory-item-${itemId}`);
  if (!card) return;
  card.classList.remove('inventory-item-scanned');
  void card.offsetWidth;
  card.classList.add('inventory-item-scanned');
}

function jumpToInventoryItem(item) {
  const place = resolveInventoryPlaceForItem(item);
  if (currentPage === 'inventory') openInventoryPlace(place);
  else {
    prepareInventoryPlace(place);
    showPage('inventory');
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      highlightScannedInventoryItem(item.id);
      focusCountInput(item.id);
    });
  });
}

function applyInventoryHeaderVisibility(showPlaceList, showPlaceDetail) {
  const appHeader = document.getElementById('app-header');
  const dashboardHeader = document.getElementById('inventory-header-dashboard');
  const detailHeader = document.getElementById('inventory-header-detail');
  const defaultHeader = document.getElementById('inventory-header-default');
  if (appHeader) {
    appHeader.classList.toggle('inventory-dashboard-mode', showPlaceList || showPlaceDetail);
  }
  setInventorySearchToolbarVisible(showPlaceDetail);
  if (dashboardHeader) dashboardHeader.hidden = !showPlaceList;
  if (detailHeader) detailHeader.hidden = !showPlaceDetail;
  if (defaultHeader) defaultHeader.hidden = showPlaceList || showPlaceDetail;
}

function updateInventoryDashboardHeader() {
  const overallEl = document.getElementById('inventory-dashboard-overall');
  if (!overallEl) return;
  if (!stockItems.length) {
    overallEl.textContent = '';
    return;
  }
  const { percent } = countEnteredProgress(stockItems);
  overallEl.textContent = overallProgressLabel(percent);
}

function updateInventoryDetailHeader() {
  const placeNameEl = document.getElementById('inventory-detail-place-name');
  const progressPill = document.getElementById('inventory-detail-progress-pill');
  if (placeNameEl) placeNameEl.textContent = inventoryPlaceFilter;
  if (!progressPill) return;
  const items = getDetailScopeItems();
  progressPill.textContent = items.length ? formatProgressPill(items) : '0/0';
}

function updateInventoryHeaderMode() {
  const showPlaceList = currentPage === 'inventory' && isInventoryPlaceListView();
  const showPlaceDetail = isInventoryPlaceDetailView();
  applyInventoryHeaderVisibility(showPlaceList, showPlaceDetail);
  if (showPlaceList) updateInventoryDashboardHeader();
  else if (showPlaceDetail) updateInventoryDetailHeader();
}
