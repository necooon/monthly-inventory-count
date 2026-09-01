function renderFilters() {
  const st = S();
  const inv = st.filters.inventory;
  const filterDiv = document.getElementById('location-filters');
  filterDiv.innerHTML = '';
  if (inv.cycle !== C.ALL_FILTER && !st.masters.cycles.includes(inv.cycle)) {
    inv.cycle = C.ALL_FILTER;
  }
  if (inv.place !== C.ALL_FILTER && inv.place !== C.UNSET_PLACE_FILTER && !st.masters.places.includes(inv.place)) {
    inv.place = C.ALL_FILTER;
  }
  inv.cycle = bindFilterSelect(filterDiv, 'チェック頻度', st.masters.cycles, inv.cycle, value => { inv.cycle = value; });
  inv.place = bindFilterSelect(filterDiv, '場所', [C.UNSET_PLACE_FILTER, ...st.masters.places], inv.place, value => { inv.place = value; });
  const unentered = document.createElement('label');
  unentered.className = 'filter-check';
  const unenteredInput = document.createElement('input');
  unenteredInput.type = 'checkbox';
  unenteredInput.checked = inv.unenteredOnly;
  unenteredInput.onchange = () => {
    inv.unenteredOnly = unenteredInput.checked;
    saveAndRender();
  };
  unentered.appendChild(unenteredInput);
  unentered.appendChild(document.createTextNode('未入力だけ表示'));
  filterDiv.appendChild(unentered);
  updateResetLocationButton();
}

function inventoryFilterLabel() {
  const inv = S().filters.inventory;
  const parts = [];
  if (inv.cycle !== C.ALL_FILTER) parts.push(inv.cycle);
  if (inv.place !== C.ALL_FILTER) parts.push(inv.place);
  return parts.join('・');
}

function updateResetLocationButton() {
  const btn = document.getElementById('reset-location-btn');
  const row = document.getElementById('inventory-action-row');
  const label = inventoryFilterLabel();
  const show = !!label;
  btn.hidden = !show;
  btn.textContent = show ? `「${label}」をリセット` : 'リセット';
  if (row) row.hidden = !show;
}

function resetEnteredItems(cycleFilter, placeFilter) {
  const st = S();
  const scoped = cycleFilter != null || placeFilter != null;
  const targetItems = scoped
    ? st.stockItems.filter(item => I.itemMatchesCyclePlace(item, cycleFilter, placeFilter))
    : st.stockItems;
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
  const inv = S().filters.inventory;
  if (inv.cycle === C.ALL_FILTER && inv.place === C.ALL_FILTER) return;
  resetEnteredItems(inv.cycle, inv.place);
}

function getScopeItems() {
  const inv = S().filters.inventory;
  return S().stockItems.filter(item => I.itemMatchesCyclePlace(item, inv.cycle, inv.place));
}

function getFilteredItems() {
  const inv = S().filters.inventory;
  const items = getScopeItems();
  return inv.unenteredOnly ? items.filter(item => !item.entered) : items;
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

function updateInventoryProgress() {
  const inv = S().filters.inventory;
  const wrap = document.getElementById('inventory-progress');
  const label = document.getElementById('inventory-progress-label');
  const fill = document.getElementById('inventory-progress-fill');
  updatePageTitle();
  if (!wrap || !label || !fill) return;
  const items = getScopeItems();
  if (!items.length) {
    wrap.hidden = true;
    return;
  }
  const done = items.filter(item => item.entered).length;
  const remaining = items.length - done;
  wrap.hidden = false;
  label.textContent = inv.unenteredOnly
    ? (remaining === 0 ? '未入力はありません' : `残り ${remaining} 件`)
    : `${done} / ${items.length} 件入力済み`;
  fill.style.width = `${Math.round((done / items.length) * 100)}%`;
}

function inventoryPlacesForItem(item) {
  const inv = S().filters.inventory;
  const units = I.itemCheckUnits(item).filter(u =>
    (inv.cycle === C.ALL_FILTER || u.cycle === inv.cycle) &&
    (inv.place === C.ALL_FILTER ||
      (inv.place === C.UNSET_PLACE_FILTER ? !u.place : u.place === inv.place))
  );
  const places = [...new Set(units.map(u => u.place ? u.place : C.UNSET_PLACE_FILTER))];
  return places.length ? places : [C.UNSET_PLACE_FILTER];
}

function inventoryPlaceOrder() {
  const names = S().masters.places.filter(Boolean);
  if (!names.includes(C.UNSET_PLACE_FILTER)) names.push(C.UNSET_PLACE_FILTER);
  return names;
}

function toggleInventoryPlaceGroup(place) {
  const collapsed = S().filters.inventory.collapsedPlaces;
  if (collapsed.has(place)) collapsed.delete(place);
  else collapsed.add(place);
  CheckStock.storage.persistInventoryCollapsedPlaces();
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
  const input = Array.from(document.querySelectorAll('#stock-list .count-input'))
    .find(el => String(el.dataset.itemId) === target);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

function adjustCount(event, id, delta) {
  event.stopPropagation();
  const item = I.findItemById(id);
  if (!item) return;
  const step = Number(delta);
  if (item.entered && item.count <= 0 && step < 0) return;
  const current = item.entered ? item.count : 0;
  const next = Math.max(0, current + step);
  updateCountDirect(id, String(next), { keepFocus: true });
}

function updateCountDirect(id, value, options) {
  const item = I.findItemById(id);
  if (!item) return;
  const trimmed = String(value).trim();
  let moveToUnentered = false;
  if (trimmed === '') {
    item.count = 0;
    item.entered = false;
  } else {
    const newCount = parseInt(trimmed, 10);
    if (isNaN(newCount)) return;
    item.count = newCount < 0 ? 0 : newCount;
    item.entered = true;
    moveToUnentered = true;
  }
  const jump = moveToUnentered && !(options && options.keepFocus);
  const nextId = jump ? nextUnenteredIdAfter(id) : null;
  saveAndRender();
  if (nextId != null) {
    requestAnimationFrame(() => focusCountInput(nextId));
  }
}

function renderInventory() {
  const st = S();
  const inv = st.filters.inventory;
  const listDiv = document.getElementById('stock-list');
  if (!listDiv) return;
  listDiv.innerHTML = '';

  const filteredItems = getFilteredItems();
  const groups = new Map();
  filteredItems.forEach(item => {
    inventoryPlacesForItem(item).forEach(place => {
      if (!groups.has(place)) groups.set(place, []);
      groups.get(place).push(item);
    });
  });
  const placeOrder = inventoryPlaceOrder();
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = placeOrder.indexOf(a);
    const ib = placeOrder.indexOf(b);
    const sa = ia < 0 ? 999 : ia;
    const sb = ib < 0 ? 999 : ib;
    return sa - sb || a.localeCompare(b, 'ja');
  });

  if (filteredItems.length === 0) {
    listDiv.innerHTML = inv.unenteredOnly
      ? '<div class="empty-message">未入力のアイテムはありません。</div>'
      : '<div class="empty-message">この条件のアイテムはありません。設定のアイテムから追加してください。</div>';
    return;
  }

  keys.forEach(place => {
    const placeItems = groups.get(place).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
    const collapsed = inv.collapsedPlaces.has(place);
    const placeDone = placeItems.length > 0 && placeItems.every(item => item.entered);
    const group = document.createElement('div');
    group.className = `order-group${collapsed ? ' collapsed' : ''}${placeDone ? ' place-complete' : ''}`;
    group.dataset.place = place;
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'order-group-title';
    title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (placeDone) title.setAttribute('aria-label', `${place}、チェック完了、${placeItems.length}件`);
    title.innerHTML = `<span class="order-group-chevron" aria-hidden="true">${collapsed ? '▶' : '▼'}</span>${placeDone ? '<span class="order-group-check" aria-hidden="true">✓</span>' : ''}<span>${place}</span><span class="order-group-count">${placeItems.length}件</span>`;
    title.onclick = () => toggleInventoryPlaceGroup(place);
    group.appendChild(title);
    const body = document.createElement('div');
    body.className = 'order-group-items';
    placeItems.forEach(item => {
      const itemNeedsOrder = I.needsOrder(item);
      const itemDiv = document.createElement('div');
      itemDiv.className = `item inventory-item ${itemNeedsOrder ? 'empty' : ''} ${item.complete ? 'complete' : ''} ${String(st.ui.selectedItemId) === String(item.id) ? 'selected' : ''}`;
      itemDiv.dataset.itemId = item.id;
      const countDisplay = item.entered ? String(item.count) : '';
      const showCount = primaryCountPlace(item) === place;
      const minusDisabled = item.entered && item.count <= 0;
      const countControls = showCount ? `
                  <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1減らす" ${minusDisabled ? 'disabled' : ''} onclick="adjustCount(event, this.dataset.itemId, -1)">−</button>
                  <input type="text" class="count-input${item.entered ? '' : ' unentered'}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="${item.name}の在庫数" value="${countDisplay}" data-item-id="${item.id}" onfocus="this.select()" oninput="filterCountInput(this)" onchange="updateCountDirect(this.dataset.itemId, this.value)" onkeydown="handleCountKey(event)">
                  <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1増やす" onclick="adjustCount(event, this.dataset.itemId, 1)">＋</button>
                  <span class="unit-suffix">${item.unit}</span>` : `<span class="count-shared-note">「${primaryCountPlace(item)}」で入力${item.entered ? ` · ${formatQty(item.count, item.unit)}` : ' · 未入力'}</span>`;
      itemDiv.innerHTML = `
        <div class="inventory-line">
          <button type="button" class="item-edit-btn" data-item-id="${item.id}" aria-label="${item.name}を編集" onclick="selectAndEditItem(this.dataset.itemId)">⋯</button>
          <span class="item-name">
            <span class="item-name-text">${item.name}</span>
          </span>
          <div class="inventory-count">${countControls}</div>
        </div>
      `;
      body.appendChild(itemDiv);
    });
    group.appendChild(body);
    listDiv.appendChild(group);
  });
}

window.resetCurrentLocation = resetCurrentLocation;
window.adjustCount = adjustCount;
window.updateCountDirect = updateCountDirect;
window.handleCountKey = handleCountKey;
window.filterCountInput = filterCountInput;
