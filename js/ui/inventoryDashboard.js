const INVENTORY_EMPTY_NO_ITEMS = 'この条件のアイテムはありません。設定のアイテムから追加してください。';
const INVENTORY_EMPTY_NO_UNENTERED = '未入力のアイテムはありません。';
const INVENTORY_EMPTY_NO_SEARCH = '検索条件に一致するアイテムはありません。';

let inventorySearchQuery = '';

function isInventoryDashboard() {
  return inventoryPlaceFilter === ALL_FILTER;
}

function isInventoryDetailView() {
  return currentPage === 'inventory' && !isInventoryDashboard();
}

function toggleInventoryView(isDashboard) {
  const dashboard = document.getElementById('inventory-place-dashboard');
  const detailNav = document.getElementById('inventory-detail-nav');
  const searchToolbar = document.getElementById('inventory-search-toolbar');
  const stockList = document.getElementById('stock-list');
  const pageInventory = document.getElementById('page-inventory');
  if (dashboard) dashboard.hidden = !isDashboard;
  if (detailNav) detailNav.hidden = true;
  if (searchToolbar) searchToolbar.hidden = isDashboard;
  if (stockList) stockList.hidden = isDashboard;
  if (pageInventory) {
    pageInventory.classList.toggle('inventory-dashboard-view', isDashboard);
    pageInventory.classList.toggle('inventory-detail-view', !isDashboard);
  }
}

function openInventoryPlace(place) {
  inventoryPlaceFilter = place;
  inventoryUnenteredOnly = false;
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

function handleInventorySearch(input) {
  inventorySearchQuery = input.value;
  const listDiv = document.getElementById('stock-list');
  if (listDiv && isInventoryDetailView()) renderInventoryDetailList(listDiv);
}

function openInventoryScan() {
  alert('バーコードスキャン機能は準備中です。');
}

function updateInventoryHeaderMode() {
  const appHeader = document.getElementById('app-header');
  const dashboardHeader = document.getElementById('inventory-header-dashboard');
  const detailHeader = document.getElementById('inventory-header-detail');
  const defaultHeader = document.getElementById('inventory-header-default');
  const showDashboard = currentPage === 'inventory' && isInventoryDashboard();
  const showDetail = isInventoryDetailView();

  if (appHeader) {
    appHeader.classList.toggle('inventory-dashboard-mode', showDashboard || showDetail);
  }
  if (dashboardHeader) dashboardHeader.hidden = !showDashboard;
  if (detailHeader) detailHeader.hidden = !showDetail;
  if (defaultHeader) defaultHeader.hidden = showDashboard || showDetail;

  if (showDashboard) {
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

  if (!showDetail) return;

  const placeNameEl = document.getElementById('inventory-detail-place-name');
  const progressPill = document.getElementById('inventory-detail-progress-pill');
  if (placeNameEl) placeNameEl.textContent = inventoryPlaceFilter;
  if (!progressPill) return;

  const items = getPlaceScopeItems(inventoryPlaceFilter);
  if (!items.length) {
    progressPill.textContent = '0/0';
    return;
  }
  const { done, total } = countEnteredProgress(items);
  progressPill.textContent = `${done}/${total}`;
}

function createPlaceCard(place) {
  const { total, done, percent } = getPlaceProgress(place);
  const status = getPlaceStatus(done, total);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `place-card place-card-${status}`;
  card.setAttribute('aria-label', `${place}、${placeBadgeText(status, done, total)}（${percent}%）`);
  card.onclick = () => openInventoryPlace(place);
  card.innerHTML = `
    <div class="place-card-head">
      <span class="place-card-name">${place}</span>
      <span class="place-card-badge ${status}">${placeBadgeText(status, done, total)}</span>
    </div>
    <div class="place-card-bar" aria-hidden="true">
      <div class="place-card-bar-track"><div class="place-card-bar-fill ${status}" style="width: ${percent}%"></div></div>
    </div>
  `;
  return card;
}

function renderPlaceDashboard() {
  const dashboard = document.getElementById('inventory-place-dashboard');
  if (!dashboard) return;
  dashboard.replaceChildren();
  const places = getDashboardPlaces();
  if (!places.length) {
    dashboard.innerHTML = `<div class="empty-message">${INVENTORY_EMPTY_NO_ITEMS}</div>`;
    return;
  }
  places.forEach(place => dashboard.appendChild(createPlaceCard(place)));
}

function renderInventoryDetailList(listDiv) {
  const filteredItems = getFilteredItems();
  listDiv.replaceChildren();

  if (!filteredItems.length) {
    const message = inventorySearchQuery.trim()
      ? INVENTORY_EMPTY_NO_SEARCH
      : (inventoryUnenteredOnly ? INVENTORY_EMPTY_NO_UNENTERED : INVENTORY_EMPTY_NO_ITEMS);
    listDiv.innerHTML = `<div class="empty-message">${message}</div>`;
    return;
  }

  filteredItems
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'))
    .forEach(item => listDiv.appendChild(renderInventoryItemRow(item)));
}
