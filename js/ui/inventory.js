const PLACE_STATUS_LABELS = {
  complete: '完了',
  'in-progress': '進行中',
  'not-started': '未着手'
};

function isInventoryDashboard() {
  return inventoryPlaceFilter === ALL_FILTER;
}

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

function getPlaceScopeItems(place) {
  return stockItems.filter(item => itemMatchesCyclePlace(item, inventoryCycleFilter, place));
}

function getPlaceProgress(place) {
  const items = getPlaceScopeItems(place);
  const total = items.length;
  const done = items.filter(item => item.entered).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}

function getPlaceStatus(done, total) {
  if (total === 0) return null;
  if (done === 0) return 'not-started';
  if (done === total) return 'complete';
  return 'in-progress';
}

function getDashboardPlaces() {
  return inventoryPlaceOrder().filter(place => getPlaceScopeItems(place).length > 0);
}

function getFilteredItems() {
  const items = getScopeItems();
  return inventoryUnenteredOnly ? items.filter(item => !item.entered) : items;
}

function placeSortIndex(place) {
  const order = inventoryPlaceOrder();
  const i = order.indexOf(place);
  return i < 0 ? 999 : i;
}

function primaryCountPlace(item) {
  const places = inventoryPlacesForItem(item);
  return places.slice().sort((a, b) => placeSortIndex(a) - placeSortIndex(b) || a.localeCompare(b, 'ja'))[0];
}

function updatePageTitle() {
  const titleEl = document.getElementById('page-title');
  if (!titleEl) return;
  titleEl.textContent = APP_TITLE;
  document.title = APP_TITLE;
}

function updateInventoryProgress() {
  const wrap = document.getElementById('inventory-progress');
  const label = document.getElementById('inventory-progress-label');
  const fill = document.getElementById('inventory-progress-fill');
  updatePageTitle();
  if (!wrap || !label || !fill) return;
  if (currentPage !== 'inventory') {
    wrap.hidden = true;
    return;
  }
  let items;
  if (isInventoryDashboard()) {
    items = stockItems;
  } else {
    items = getPlaceScopeItems(inventoryPlaceFilter);
  }
  if (!items.length) {
    wrap.hidden = true;
    return;
  }
  const done = items.filter(item => item.entered).length;
  const percent = Math.round((done / items.length) * 100);
  wrap.hidden = false;
  wrap.setAttribute('aria-valuenow', String(percent));
  label.textContent = `${done} / ${items.length}（${percent}%）`;
  fill.style.width = `${percent}%`;
}

function inventoryPlacesForItem(item) {
  const units = itemCheckUnits(item).filter(u =>
    (inventoryCycleFilter === ALL_FILTER || u.cycle === inventoryCycleFilter) &&
    (inventoryPlaceFilter === ALL_FILTER ||
      (inventoryPlaceFilter === UNSET_PLACE_FILTER ? !u.place : u.place === inventoryPlaceFilter))
  );
  const places = [...new Set(units.map(u => u.place ? u.place : UNSET_PLACE_FILTER))];
  return places.length ? places : [UNSET_PLACE_FILTER];
}

function inventoryPlaceOrder() {
  const names = customPlaces.filter(Boolean);
  if (!names.includes(UNSET_PLACE_FILTER)) names.push(UNSET_PLACE_FILTER);
  return names;
}

function toggleInventoryView(isDashboard) {
  const dashboard = document.getElementById('inventory-place-dashboard');
  const detailNav = document.getElementById('inventory-detail-nav');
  const stockList = document.getElementById('stock-list');
  if (dashboard) dashboard.hidden = !isDashboard;
  if (detailNav) detailNav.hidden = isDashboard;
  if (stockList) stockList.hidden = isDashboard;
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

function toggleInventoryPlaceGroup(place) {
  if (inventoryCollapsedPlaces.has(place)) inventoryCollapsedPlaces.delete(place);
  else inventoryCollapsedPlaces.add(place);
  persistInventoryCollapsedPlaces();
  saveAndRender();
}

function nextUnenteredIdAfter(id) {
  const visible = getFilteredItems();
  const idx = visible.findIndex(item => String(item.id) === String(id));
  const search = idx === -1 ? visible : visible.slice(idx + 1).concat(visible.slice(0, idx));
  const next = search.find(item => !item.entered);
  return next ? next.id : null;
}

function focusCountInput(id) {
  if (id == null) return;
  const target = String(id);
  const card = document.getElementById(`inventory-item-${target}`);
  const input = Array.from(document.querySelectorAll('#stock-list .count-input'))
    .find(el => String(el.dataset.itemId) === target);
  const el = input || card;
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (!input) return;
  input.focus();
  input.select();
}

function handleCountKey(event) {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    event.target.blur();
  }
}

function filterCountInput(input) {
  input.value = input.value.replace(/[^\d]/g, '');
}

function applyCountToItem(id, value) {
  const item = findItemById(id);
  if (!item) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') {
    item.count = 0;
    item.entered = false;
    return { item, moveToUnentered: false };
  }
  const newCount = parseInt(trimmed, 10);
  if (isNaN(newCount)) return null;
  item.count = newCount < 0 ? 0 : newCount;
  item.entered = true;
  return { item, moveToUnentered: true };
}

function handleCountInput(input) {
  filterCountInput(input);
  if (!applyCountToItem(input.dataset.itemId, input.value)) return;
  scheduleLocalAutosave();
}

function adjustCount(event, id, delta) {
  event.stopPropagation();
  const item = findItemById(id);
  if (!item) return;
  const step = Number(delta);
  if (item.entered && item.count <= 0 && step < 0) return;
  const current = item.entered ? item.count : 0;
  const next = Math.max(0, current + step);
  updateCountDirect(id, String(next), { keepFocus: true });
}

function updateCountDirect(id, value, options) {
  const applied = applyCountToItem(id, value);
  if (!applied) return;
  const jump = applied.moveToUnentered && !(options && options.keepFocus);
  const nextId = jump ? nextUnenteredIdAfter(id) : null;
  persistAutosave({ render: true });
  if (nextId != null) {
    requestAnimationFrame(() => focusCountInput(nextId));
  }
}

function renderInventoryItemRow(item, place) {
  const itemDiv = document.createElement('div');
  itemDiv.className = itemCardClassName(item, 'inventory-item');
  itemDiv.dataset.itemId = item.id;
  const countDisplay = item.entered ? String(item.count) : '';
  const showCount = !place || primaryCountPlace(item) === place;
  if (showCount) itemDiv.id = `inventory-item-${item.id}`;
  const minusDisabled = item.entered && item.count <= 0;
  const countControls = showCount ? `
    <div class="count-stepper">
      <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1減らす" ${minusDisabled ? 'disabled' : ''} onclick="adjustCount(event, this.dataset.itemId, -1)">−</button>
      <input type="text" class="count-input${item.entered ? '' : ' unentered'}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="${item.name}の在庫数" value="${countDisplay}" data-item-id="${item.id}" onfocus="this.select()" oninput="handleCountInput(this)" onchange="updateCountDirect(this.dataset.itemId, this.value)" onkeydown="handleCountKey(event)">
      <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1増やす" onclick="adjustCount(event, this.dataset.itemId, 1)">＋</button>
    </div>
    <span class="unit-suffix">${item.unit}</span>` : `<span class="count-shared-note">「${primaryCountPlace(item)}」で入力${item.entered ? ` · ${formatQty(item.count, item.unit)}` : ' · 未入力'}</span>`;
  itemDiv.innerHTML = `
    <div class="inventory-line">
      <button type="button" class="item-edit-btn" data-item-id="${item.id}" aria-label="${item.name}を編集" onclick="selectAndEditItem(this.dataset.itemId)">⋯</button>
      ${itemNameHtml(item)}
      <div class="inventory-count">${countControls}</div>
    </div>
  `;
  return itemDiv;
}

function renderPlaceDashboard() {
  const dashboard = document.getElementById('inventory-place-dashboard');
  if (!dashboard) return;
  dashboard.innerHTML = '';
  const places = getDashboardPlaces();
  if (!places.length) {
    dashboard.innerHTML = '<div class="empty-message">この条件のアイテムはありません。設定のアイテムから追加してください。</div>';
    return;
  }
  places.forEach(place => {
    const { total, done, percent } = getPlaceProgress(place);
    const status = getPlaceStatus(done, total);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `place-card place-card-${status}`;
    card.setAttribute('aria-label', `${place}、${PLACE_STATUS_LABELS[status]}、${done} / ${total}（${percent}%）`);
    card.onclick = () => openInventoryPlace(place);
    card.innerHTML = `
      <div class="place-card-head">
        <span class="place-card-name">${place}</span>
        <span class="place-card-badge ${status}">${PLACE_STATUS_LABELS[status]}</span>
      </div>
      <div class="place-card-progress">
        <span class="place-card-progress-label">${done} / ${total}（${percent}%）</span>
        <div class="progress-bar-track" aria-hidden="true"><div class="progress-bar-fill" style="width: ${percent}%"></div></div>
      </div>
    `;
    dashboard.appendChild(card);
  });
}

function renderInventoryDetailList(listDiv) {
  const detailPlaceEl = document.getElementById('inventory-detail-place');
  if (detailPlaceEl) detailPlaceEl.textContent = inventoryPlaceFilter;

  const filteredItems = getFilteredItems();
  if (filteredItems.length === 0) {
    listDiv.innerHTML = inventoryUnenteredOnly
      ? '<div class="empty-message">未入力のアイテムはありません。</div>'
      : '<div class="empty-message">この条件のアイテムはありません。設定のアイテムから追加してください。</div>';
    return;
  }

  const sorted = filteredItems.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
  sorted.forEach(item => {
    listDiv.appendChild(renderInventoryItemRow(item, inventoryPlaceFilter));
  });
}

function renderInventory() {
  const listDiv = document.getElementById('stock-list');
  if (!listDiv) return;

  if (!isInventoryDashboard() && getPlaceScopeItems(inventoryPlaceFilter).length === 0) {
    inventoryPlaceFilter = ALL_FILTER;
  }

  const isDashboard = isInventoryDashboard();
  toggleInventoryView(isDashboard);
  listDiv.innerHTML = '';

  if (isDashboard) {
    renderPlaceDashboard();
    return;
  }

  renderInventoryDetailList(listDiv);
}
