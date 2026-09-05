function renderFilters() {
  const filterDiv = document.getElementById('location-filters');
  filterDiv.innerHTML = '';
  if (inventoryCycleFilter !== ALL_FILTER && !customCycles.includes(inventoryCycleFilter)) {
    inventoryCycleFilter = ALL_FILTER;
  }
  if (inventoryPlaceFilter !== ALL_FILTER && inventoryPlaceFilter !== UNSET_PLACE_FILTER && !customPlaces.includes(inventoryPlaceFilter)) {
    inventoryPlaceFilter = ALL_FILTER;
  }
  if (!isInventoryDashboard()) {
    filterDiv.hidden = true;
    updateResetLocationButton();
    return;
  }
  filterDiv.hidden = false;
  inventoryCycleFilter = bindFilterSelect(filterDiv, 'チェック頻度', customCycles, inventoryCycleFilter, value => { inventoryCycleFilter = value; });
  updateResetLocationButton();
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
  if (isInventoryDashboard()) {
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

function getScopeItems() {
  return stockItems.filter(item => itemMatchesCyclePlace(item, inventoryCycleFilter, inventoryPlaceFilter));
}

function getFilteredItems() {
  const items = getScopeItems();
  const scoped = inventoryUnenteredOnly ? items.filter(item => !item.entered) : items;
  const query = inventorySearchQuery.trim().toLowerCase();
  if (!query) return scoped;
  return scoped.filter(item => itemMatchesInventorySearch(item, query));
}

function itemMatchesInventorySearch(item, query) {
  if (String(item.name || '').toLowerCase().includes(query)) return true;
  return productsForItem(item.id).some(product =>
    String(product.name || '').toLowerCase().includes(query) ||
    String(product.barcode || '').toLowerCase().includes(query)
  );
}

function updatePageTitle() {
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = APP_TITLE;
  document.title = APP_TITLE;
}

function updateInventoryProgress() {
  updateInventoryHeaderMode();
  const wrap = document.getElementById('inventory-progress');
  const label = document.getElementById('inventory-progress-label');
  const fill = document.getElementById('inventory-progress-fill');
  updatePageTitle();
  if (!wrap || !label || !fill) return;
  if (currentPage !== 'inventory' || isInventoryDashboard() || isInventoryDetailView()) {
    wrap.hidden = true;
    return;
  }
  const items = getPlaceScopeItems(inventoryPlaceFilter);
  if (!items.length) {
    wrap.hidden = true;
    return;
  }
  const { done, total, percent } = countEnteredProgress(items);
  wrap.hidden = false;
  wrap.setAttribute('aria-valuenow', String(percent));
  label.textContent = progressLabel(done, total);
  fill.style.width = `${percent}%`;
}

function renderInventoryItemRow(item) {
  const itemDiv = document.createElement('div');
  itemDiv.className = itemCardClassName(item, 'inventory-item');
  itemDiv.dataset.itemId = item.id;
  itemDiv.id = `inventory-item-${item.id}`;
  itemDiv.innerHTML = inventoryItemRowInnerHtml(item);
  return itemDiv;
}

function inventoryItemMetaLine(item) {
  const products = productsForItem(item.id);
  const barcode = products.map(p => String(p.barcode || '').trim()).find(Boolean);
  if (barcode) return barcode;
  const category = normalizeCategory(item.category);
  return category || '';
}

function inventoryCheckBadgeHtml(item) {
  const key = itemCheckStatus(item);
  const done = key === 'check-done';
  const label = done ? '完了' : '未入力';
  const chars = done ? ['完', '了'] : ['未', '入', '力'];
  const spans = chars.map(ch => `<span aria-hidden="true">${ch}</span>`).join('');
  return `<span class="inventory-check-badge ${done ? 'done' : 'unentered'}" role="status" aria-label="${label}">${spans}</span>`;
}

function inventoryItemRowInnerHtml(item) {
  const countDisplay = item.entered ? String(item.count) : '';
  const minusDisabled = item.entered && item.count <= 0;
  const meta = inventoryItemMetaLine(item);
  return `
    <div class="inventory-card">
      ${inventoryCheckBadgeHtml(item)}
      <div class="inventory-card-body">
        <div class="inventory-card-title">${item.name}</div>
        ${meta ? `<div class="inventory-card-meta">${meta}</div>` : ''}
      </div>
      <div class="inventory-count">
        <div class="count-stepper">
          <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1減らす" ${minusDisabled ? 'disabled' : ''} onclick="adjustCount(event, this.dataset.itemId, -1)">−</button>
          <input type="text" class="count-input${item.entered ? '' : ' unentered'}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="${item.name}の在庫数" value="${countDisplay}" data-item-id="${item.id}" onfocus="this.select()" oninput="handleCountInput(this)" onchange="updateCountDirect(this.dataset.itemId, this.value)" onkeydown="handleCountKey(event)">
          <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1増やす" onclick="adjustCount(event, this.dataset.itemId, 1)">＋</button>
        </div>
      </div>
    </div>
  `;
}

function renderInventory() {
  const listDiv = document.getElementById('stock-list');
  if (!listDiv) return;

  if (!isInventoryDashboard() && getPlaceScopeItems(inventoryPlaceFilter).length === 0) {
    inventoryPlaceFilter = ALL_FILTER;
  }

  const isDashboard = isInventoryDashboard();
  toggleInventoryView(isDashboard);
  const searchInput = document.getElementById('inventory-search-input');
  if (searchInput && searchInput.value !== inventorySearchQuery) {
    searchInput.value = inventorySearchQuery;
  }
  listDiv.replaceChildren();

  if (isDashboard) {
    renderPlaceDashboard();
    return;
  }

  renderInventoryDetailList(listDiv);
}
