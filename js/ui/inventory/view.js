function isInventoryPlaceListView() {
  return inventoryPlaceFilter === ALL_FILTER;
}

function isInventoryPlaceDetailView() {
  return currentPage === 'inventory' && !isInventoryPlaceListView();
}

function isInventoryDashboard() {
  return isInventoryPlaceListView();
}

function isInventoryDetailView() {
  return isInventoryPlaceDetailView();
}

function toggleInventoryView(isPlaceList) {
  const dashboard = document.getElementById('inventory-place-dashboard');
  const searchToolbar = document.getElementById('inventory-search-toolbar');
  const stockList = document.getElementById('stock-list');
  const pageInventory = document.getElementById('page-inventory');
  if (dashboard) dashboard.hidden = !isPlaceList;
  if (searchToolbar) searchToolbar.hidden = isPlaceList;
  if (stockList) {
    stockList.hidden = isPlaceList;
    stockList.classList.toggle('stock-list-visible', !isPlaceList);
  }
  if (pageInventory) {
    pageInventory.classList.toggle('inventory-dashboard-view', isPlaceList);
    pageInventory.classList.toggle('inventory-detail-view', !isPlaceList);
  }
}

function openInventoryPlace(place) {
  inventoryPlaceFilter = place;
  inventoryCycleFilter = ALL_FILTER;
  inventorySearchQuery = '';
  const searchInput = document.getElementById('inventory-search-input');
  if (searchInput) searchInput.value = '';
  saveAndRender();
}

function closeInventoryPlace() {
  inventoryPlaceFilter = ALL_FILTER;
  inventorySearchQuery = '';
  saveAndRender();
}

function openInventoryScan() {
  alert('バーコードスキャン機能は準備中です。');
}

function updateInventoryHeaderMode() {
  const appHeader = document.getElementById('app-header');
  const dashboardHeader = document.getElementById('inventory-header-dashboard');
  const detailHeader = document.getElementById('inventory-header-detail');
  const defaultHeader = document.getElementById('inventory-header-default');
  const showPlaceList = currentPage === 'inventory' && isInventoryPlaceListView();
  const showPlaceDetail = isInventoryPlaceDetailView();

  if (appHeader) {
    appHeader.classList.toggle('inventory-dashboard-mode', showPlaceList || showPlaceDetail);
  }
  if (dashboardHeader) dashboardHeader.hidden = !showPlaceList;
  if (detailHeader) detailHeader.hidden = !showPlaceDetail;
  if (defaultHeader) defaultHeader.hidden = showPlaceList || showPlaceDetail;

  if (showPlaceList) {
    const overallEl = document.getElementById('inventory-dashboard-overall');
    if (!overallEl) return;
    if (!stockItems.length) {
      overallEl.textContent = '';
      return;
    }
    const { percent } = countEnteredProgress(stockItems);
    overallEl.textContent = overallProgressLabel(percent);
    return;
  }

  if (!showPlaceDetail) return;

  const placeNameEl = document.getElementById('inventory-detail-place-name');
  const progressPill = document.getElementById('inventory-detail-progress-pill');
  if (placeNameEl) placeNameEl.textContent = inventoryPlaceFilter;
  if (!progressPill) return;

  const items = getDetailScopeItems();
  progressPill.textContent = items.length ? formatProgressPill(items) : '0/0';
}
