const INVENTORY_EMPTY_NO_ITEMS = 'この条件のアイテムはありません。設定のアイテムから追加してください。';
const INVENTORY_EMPTY_NO_UNENTERED = '未入力のアイテムはありません。';

function isInventoryDashboard() {
  return inventoryPlaceFilter === ALL_FILTER;
}

function toggleInventoryView(isDashboard) {
  const dashboard = document.getElementById('inventory-place-dashboard');
  const detailNav = document.getElementById('inventory-detail-nav');
  const stockList = document.getElementById('stock-list');
  const pageInventory = document.getElementById('page-inventory');
  if (dashboard) dashboard.hidden = !isDashboard;
  if (detailNav) detailNav.hidden = isDashboard;
  if (stockList) stockList.hidden = isDashboard;
  if (pageInventory) pageInventory.classList.toggle('inventory-dashboard-view', isDashboard);
}

function openInventoryPlace(place) {
  inventoryPlaceFilter = place;
  inventoryUnenteredOnly = false;
  saveAndRender();
}

function closeInventoryPlace() {
  inventoryPlaceFilter = ALL_FILTER;
  saveAndRender();
}

function updateInventoryHeaderMode() {
  const appHeader = document.getElementById('app-header');
  const dashboardHeader = document.getElementById('inventory-header-dashboard');
  const defaultHeader = document.getElementById('inventory-header-default');
  const showDashboard = currentPage === 'inventory' && isInventoryDashboard();
  if (appHeader) appHeader.classList.toggle('inventory-dashboard-mode', showDashboard);
  if (dashboardHeader) dashboardHeader.hidden = !showDashboard;
  if (defaultHeader) defaultHeader.hidden = showDashboard;
  if (!showDashboard) return;

  const overallEl = document.getElementById('inventory-dashboard-overall');
  if (!overallEl) return;
  if (!stockItems.length) {
    overallEl.textContent = '';
    return;
  }
  const { percent } = countEnteredProgress(stockItems);
  overallEl.textContent = overallProgressLabel(percent);
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
  const detailPlaceEl = document.getElementById('inventory-detail-place');
  if (detailPlaceEl) detailPlaceEl.textContent = inventoryPlaceFilter;

  const filteredItems = getFilteredItems();
  if (!filteredItems.length) {
    listDiv.innerHTML = `<div class="empty-message">${inventoryUnenteredOnly ? INVENTORY_EMPTY_NO_UNENTERED : INVENTORY_EMPTY_NO_ITEMS}</div>`;
    return;
  }

  filteredItems
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'))
    .forEach(item => listDiv.appendChild(renderInventoryItemRow(item)));
}
