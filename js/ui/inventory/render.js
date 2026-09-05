function renderInventoryFilters() {
  const filterDiv = document.getElementById('location-filters');
  filterDiv.innerHTML = '';
  if (inventoryCycleFilter !== ALL_FILTER && !customCycles.includes(inventoryCycleFilter)) {
    inventoryCycleFilter = ALL_FILTER;
  }
  if (inventoryPlaceFilter !== ALL_FILTER && inventoryPlaceFilter !== UNSET_PLACE_FILTER && !customPlaces.includes(inventoryPlaceFilter) && !isInventoryPlaceDetailView()) {
    inventoryPlaceFilter = ALL_FILTER;
  }
  if (!isInventoryPlaceListView()) {
    filterDiv.hidden = true;
    updateResetLocationButton();
    return;
  }
  filterDiv.hidden = false;
  inventoryCycleFilter = bindFilterSelect(filterDiv, 'チェック頻度', customCycles, inventoryCycleFilter, value => { inventoryCycleFilter = value; });
  updateResetLocationButton();
}

function renderFilters() {
  renderInventoryFilters();
}

function inventoryFilterLabel() {
  const parts = [];
  if (inventoryCycleFilter !== ALL_FILTER) parts.push(inventoryCycleFilter);
  if (inventoryPlaceFilter !== ALL_FILTER) parts.push(inventoryPlaceFilter);
  return parts.join('・');
}

function updateResetLocationButton() {
  const resetBtn = document.getElementById('reset-location-btn');
  const row = document.getElementById('inventory-action-row');
  if (!resetBtn || !row) return;
  if (isInventoryPlaceListView()) {
    resetBtn.hidden = true;
    row.hidden = true;
    return;
  }
  const label = inventoryFilterLabel();
  const showReset = !!label;
  resetBtn.hidden = !showReset;
  resetBtn.textContent = showReset ? `「${label}」をリセット` : 'リセット';
  row.hidden = !showReset;
}

function resetEnteredItems(cycleFilter, placeFilter) {
  const scoped = cycleFilter != null || placeFilter != null;
  const targetItems = scoped
    ? stockItems.filter(item => itemMatchesCyclePlace(item, cycleFilter, placeFilter))
    : stockItems;
  const label = scoped ? inventoryFilterLabel() : '';
  if (targetItems.length === 0) {
    alert(scoped ? 'この条件にはアイテムがありません' : 'リセットするアイテムがありません');
    return;
  }
  const scope = scoped ? `「${label}」を` : 'すべて';
  if (!confirm(`${scope}リセットしますか？\nアイテム名・チェック頻度・場所・必要数はそのまま残し、すべて未入力になります。`)) {
    return;
  }
  targetItems.forEach(item => {
    item.entered = false;
  });
  saveAndRender();
}

function resetAllInventory() {
  resetEnteredItems(null, null);
}

function resetCurrentLocation() {
  if (inventoryCycleFilter === ALL_FILTER && inventoryPlaceFilter === ALL_FILTER) return;
  resetEnteredItems(inventoryCycleFilter, inventoryPlaceFilter);
}

function renderInventoryItemRow(item) {
  const itemDiv = document.createElement('div');
  itemDiv.className = itemCardClassName(item, 'inventory-item');
  itemDiv.dataset.itemId = item.id;
  itemDiv.id = `inventory-item-${item.id}`;
  itemDiv.innerHTML = inventoryItemRowInnerHtml(item);
  return itemDiv;
}

function createPlaceCard(place) {
  const { total, done, percent } = getPlaceProgress(place);
  const status = getPlaceStatus(done, total);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `place-card place-card-${status}`;
  card.setAttribute('aria-label', `${place}、${placeBadgeText(status, done, total)}（${percent}%）`);
  card.onclick = () => openInventoryPlace(place);
  card.innerHTML = placeCardHtml(place, { total, done, percent, status });
  return card;
}

function renderPlaceDashboard() {
  const dashboard = document.getElementById('inventory-place-dashboard');
  if (!dashboard) return;
  dashboard.replaceChildren();
  const places = getDashboardPlaces();
  if (!places.length) {
    dashboard.innerHTML = inventoryNoItemsHtml();
    return;
  }
  places.forEach(place => dashboard.appendChild(createPlaceCard(place)));
}

function renderInventoryDetailList(listDiv) {
  const filteredItems = getFilteredItems();
  listDiv.replaceChildren();

  if (!filteredItems.length) {
    listDiv.innerHTML = inventoryEmptyHtml();
    return;
  }

  sortItemsByNameJa(filteredItems)
    .forEach(item => listDiv.appendChild(renderInventoryItemRow(item)));
}

function renderInventory() {
  renderInventoryFilters();
  const listDiv = document.getElementById('stock-list');
  if (!listDiv) return;

  const isPlaceList = isInventoryPlaceListView();
  toggleInventoryView(isPlaceList);
  updateInventoryHeaderMode();
  syncInventorySearchInput();
  listDiv.replaceChildren();

  if (isPlaceList) {
    renderPlaceDashboard();
    return;
  }

  renderInventoryDetailList(listDiv);
}
