function renderFilters() {
  const filterDiv = document.getElementById('location-filters');
  filterDiv.innerHTML = '';
  if (inventoryCycleFilter !== ALL_FILTER && !customCycles.includes(inventoryCycleFilter)) {
    inventoryCycleFilter = ALL_FILTER;
  }
  if (inventoryPlaceFilter !== ALL_FILTER && inventoryPlaceFilter !== UNSET_PLACE_FILTER && !customPlaces.includes(inventoryPlaceFilter)) {
    inventoryPlaceFilter = ALL_FILTER;
  }
  inventoryCycleFilter = bindFilterSelect(filterDiv, 'チェック頻度', customCycles, inventoryCycleFilter, value => { inventoryCycleFilter = value; });
  if (!isInventoryDashboard()) {
    const unentered = document.createElement('label');
    unentered.className = 'filter-check';
    const unenteredInput = document.createElement('input');
    unenteredInput.type = 'checkbox';
    unenteredInput.checked = inventoryUnenteredOnly;
    unenteredInput.onchange = () => {
      inventoryUnenteredOnly = unenteredInput.checked;
      saveAndRender();
    };
    unentered.appendChild(unenteredInput);
    unentered.appendChild(document.createTextNode('未入力だけ表示'));
    filterDiv.appendChild(unentered);
  }
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
  return inventoryUnenteredOnly ? items.filter(item => !item.entered) : items;
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
  if (currentPage !== 'inventory' || isInventoryDashboard()) {
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
  const countDisplay = item.entered ? String(item.count) : '';
  const minusDisabled = item.entered && item.count <= 0;
  itemDiv.innerHTML = `
    <div class="inventory-line">
      <button type="button" class="item-edit-btn" data-item-id="${item.id}" aria-label="${item.name}を編集" onclick="selectAndEditItem(this.dataset.itemId)">⋯</button>
      ${itemNameHtml(item)}
      <div class="inventory-count">
        <div class="count-stepper">
          <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1減らす" ${minusDisabled ? 'disabled' : ''} onclick="adjustCount(event, this.dataset.itemId, -1)">−</button>
          <input type="text" class="count-input${item.entered ? '' : ' unentered'}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="${item.name}の在庫数" value="${countDisplay}" data-item-id="${item.id}" onfocus="this.select()" oninput="handleCountInput(this)" onchange="updateCountDirect(this.dataset.itemId, this.value)" onkeydown="handleCountKey(event)">
          <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1増やす" onclick="adjustCount(event, this.dataset.itemId, 1)">＋</button>
        </div>
        <span class="unit-suffix">${item.unit}</span>
      </div>
    </div>
  `;
  return itemDiv;
}

function renderInventory() {
  const listDiv = document.getElementById('stock-list');
  if (!listDiv) return;

  if (!isInventoryDashboard() && getPlaceScopeItems(inventoryPlaceFilter).length === 0) {
    inventoryPlaceFilter = ALL_FILTER;
  }

  const isDashboard = isInventoryDashboard();
  toggleInventoryView(isDashboard);
  listDiv.replaceChildren();

  if (isDashboard) {
    renderPlaceDashboard();
    return;
  }

  renderInventoryDetailList(listDiv);
}
