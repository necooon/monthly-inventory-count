const ORDER_EMPTY_MESSAGE = {
  order: '発注が必要なアイテムはありません',
  shopping: '買い物リストは空です',
  receipt: '受け取り待ちはありません'
};
const ORDER_HINT = {
  lohaco: 'LOHACO商品を選んでチェックし、何度でもカートに追加できます。店舗向けは「リストに追加」で買い物リストへ進めます。'
};
const SELECT_LOHACO_CART_LABEL = 'カートに入れる';
const SELECT_LIST_ADD_LABEL = 'リストに追加';
let selectCollapsedItemIds = new Set();

function bindOrderViewFilters(filterDiv) {
  if (!filterDiv) return orderCategoryFilter;
  filterDiv.innerHTML = '';
  return bindFilterSelect(filterDiv, 'カテゴリ', allCategories(), orderCategoryFilter, value => {
    orderCategoryFilter = value;
  });
}

function bindPickupViewFilters(filterDiv) {
  if (!filterDiv) return pickupPlaceFilter;
  filterDiv.innerHTML = '';
  return bindFilterSelect(filterDiv, '場所', [UNSET_PLACE_FILTER, ...customPlaces], pickupPlaceFilter, value => {
    pickupPlaceFilter = value;
  });
}

function toggleOrderDestGroup(dest) {
  if (orderCollapsedDests.has(dest)) orderCollapsedDests.delete(dest);
  else orderCollapsedDests.add(dest);
  persistOrderCollapsedDests();
  const collapsed = orderCollapsedDests.has(dest);
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(dest) : dest;
  const groups = document.querySelectorAll(`.order-group[data-dest="${escaped}"]`);
  if (!groups.length) {
    saveAndRender();
    return;
  }
  groups.forEach(group => {
    group.classList.toggle('collapsed', collapsed);
    const title = group.querySelector('.order-group-title');
    if (!title) return;
    title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const chevron = title.querySelector('.order-group-chevron');
    if (chevron) chevron.textContent = collapsed ? '▶' : '▼';
  });
}

function appendCategoryItemRows(body, cats, appendItem) {
  const categoryOrder = [...allCategories(), UNSET_CATEGORY_LABEL];
  sortNamesByMaster(cats.keys(), categoryOrder).forEach(cat => {
    const sub = document.createElement('div');
    sub.className = 'order-subgroup-title';
    sub.textContent = cat;
    body.appendChild(sub);
    sortItemsByNameJa(cats.get(cat)).forEach(item => appendItem(body, item, cat));
  });
}

function renderDestCategoryGroups(parent, destGroups, destOrder, appendItem, options) {
  const collapsible = !options || options.collapsible !== false;
  sortNamesByMaster(destGroups.keys(), destOrder).forEach(dest => {
    const cats = destGroups.get(dest);
    appendOrderDestGroup(parent, dest, destCategoryGroupCount(cats), body => {
      appendCategoryItemRows(body, cats, (rowParent, item) => appendItem(rowParent, item, dest));
    }, { collapsible });
  });
}

function appendOrderDestGroup(parent, dest, destCount, fillBody, options) {
  const collapsible = !options || options.collapsible !== false;
  const collapsed = collapsible && orderCollapsedDests.has(dest);
  const group = document.createElement('div');
  group.className = `order-group${collapsed ? ' collapsed' : ''}`;
  group.dataset.dest = dest;
  const title = document.createElement(collapsible ? 'button' : 'div');
  title.className = 'order-group-title';
  title.setAttribute('aria-label', `${dest}、${destCount}件`);
  if (collapsible) {
    title.type = 'button';
    title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    title.innerHTML = `<span class="order-group-chevron" aria-hidden="true">${collapsed ? '▶' : '▼'}</span><span>${dest}</span><span class="order-group-count">${destCount}件</span>`;
    title.onclick = () => toggleOrderDestGroup(dest);
  } else {
    title.innerHTML = `<span>${dest}</span><span class="order-group-count">${destCount}件</span>`;
  }
  group.appendChild(title);
  const body = document.createElement('div');
  body.className = 'order-group-items';
  fillBody(body);
  group.appendChild(body);
  parent.appendChild(group);
}

function setOrderHint(mode) {
  const hint = document.getElementById('order-hint');
  if (hint) hint.textContent = ORDER_HINT[mode] || ORDER_HINT.lohaco;
}

function labeledCount(label, n) {
  return n ? `${label}（${n}）` : label;
}

function setOrderLohacoActionsVisible(visible) {
  const bar = document.getElementById('order-lohaco-actions');
  const page = document.getElementById('page-order');
  if (bar) bar.hidden = !visible;
  if (page) page.classList.toggle('lohaco-select-step', !!visible);
  if (visible) syncLohacoSelectButtons();
}

function lohacoSelectCheckedRows() {
  const rows = [];
  const seen = new Set();
  document.querySelectorAll('#order-list .order-lohaco-check:checked').forEach(input => {
    const item = findItemById(input.dataset.itemId);
    if (!item) return;
    const id = String(item.id);
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({ item, dest: input.dataset.dest || '' });
  });
  return rows;
}

function lohacoCartUrlsForItems(items) {
  return items.map(item => {
    const productId = getLohacoSelectedProductId(item);
    const product = productId ? findProductById(productId) : null;
    return product ? lohacoCartAddUrl(product) : '';
  }).filter(Boolean);
}

function lohacoCartReadyCount(rows) {
  return lohacoCartUrlsForItems(rows.map(row => row.item)).length;
}

function validateLohacoSelection(rows) {
  for (const row of rows) {
    const products = lohacoProductsForItem(row.item);
    if (products.length <= 1) continue;
    if (!getLohacoSelectedProductId(row.item)) {
      alert(`「${row.item.name}」のLOHACO商品を選んでください。`);
      return false;
    }
  }
  return true;
}

function syncLohacoSelectButtons() {
  const rows = lohacoSelectCheckedRows();
  const n = rows.length;
  const cartReady = lohacoCartReadyCount(rows);
  const confirmBtn = document.getElementById('confirm-lohaco-select-btn');
  const shopBtn = document.getElementById('skip-lohaco-select-btn');
  if (confirmBtn) {
    confirmBtn.disabled = n === 0;
    if (!n) confirmBtn.textContent = SELECT_LOHACO_CART_LABEL;
    else if (cartReady === n) confirmBtn.textContent = labeledCount(SELECT_LOHACO_CART_LABEL, n);
    else if (cartReady > 0) confirmBtn.textContent = `${SELECT_LOHACO_CART_LABEL}（${cartReady}/${n}）`;
    else confirmBtn.textContent = labeledCount('受け取り待ちへ', n);
  }
  if (shopBtn) {
    shopBtn.disabled = n === 0;
    shopBtn.textContent = labeledCount(SELECT_LIST_ADD_LABEL, n);
  }
}

function renderLohacoSelectList(orderDiv, items) {
  renderDestCategoryGroups(
    orderDiv,
    groupItemsByDest(items, selectDestForItem),
    selectDestSortOrder(),
    appendLohacoSelectRow
  );
}

function renderPlaceOrderList() {
  const orderDiv = document.getElementById('order-list');
  const filterDiv = document.getElementById('order-filters');
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  orderCategoryFilter = bindOrderViewFilters(filterDiv);
  const items = itemsForLohacoSelect();
  if (!items.length) {
    setOrderHint('lohaco');
    setOrderLohacoActionsVisible(false);
    orderDiv.innerHTML = `<div class="empty-message">${ORDER_EMPTY_MESSAGE.order}</div>`;
    return;
  }
  setOrderHint('lohaco');
  renderLohacoSelectList(orderDiv, items);
  setOrderLohacoActionsVisible(true);
}

function setNavCount(nav, baseLabel, n) {
  if (!nav) return;
  const badge = nav.querySelector('.tab-badge');
  if (badge) {
    badge.hidden = !n;
    badge.textContent = n ? String(n) : '';
  }
  nav.setAttribute('aria-label', n ? `${baseLabel}、${n}件` : baseLabel);
}

function renderOrderList() {
  renderPlaceOrderList();
  Object.keys(FULFILL_PAGES).forEach(renderFulfillmentPage);
  const counts = fulfillmentCounts();
  updateFulfillNavCounts(counts);
  setNavCount(document.getElementById('nav-order'), 'Select', counts.order);
}

function hideUndoToast() {
  const toast = document.getElementById('undo-toast');
  if (toast) toast.classList.remove('open');
  if (undoToastTimer) {
    clearTimeout(undoToastTimer);
    undoToastTimer = null;
  }
}

function showUndoToast(message) {
  const toast = document.getElementById('undo-toast');
  const text = document.getElementById('undo-toast-text');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('open');
  if (undoToastTimer) clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(() => {
    lastOrderUndo = null;
    hideUndoToast();
  }, 8000);
}

function queueBulkFulfillment(items, destAndProductForItem, toast) {
  if (!items.length) return;
  lastOrderUndo = items.map(item => captureFulfillment(item));
  items.forEach(item => {
    const { dest, productId } = destAndProductForItem(item);
    queueItemFulfillment(item, dest, productId || '');
  });
  saveAndRender();
  showUndoToast(toast);
}

function shoppingDestFromSelectRow(row) {
  if (!row.dest || row.dest === LOHACO_DEST_NAME) return shoppingListDestForItem(row.item);
  return row.dest;
}

function confirmLohacoSelection() {
  const rows = lohacoSelectCheckedRows();
  if (!rows.length) return;
  if (!validateLohacoSelection(rows)) return;
  ensurePurchaseDest(LOHACO_DEST_NAME, 'online');
  persistMasters();
  const items = rows.map(row => row.item);
  const cartUrls = lohacoCartUrlsForItems(items);
  queueBulkFulfillment(
    items,
    item => ({ dest: LOHACO_DEST_NAME, productId: getLohacoSelectedProductId(item) }),
    cartUrls.length
      ? `${items.length}件を受け取り待ちにし、LOHACOカートへ追加します`
      : `${items.length}件を受け取り待ちにしました`
  );
  clearLohacoSelectedProductIds(items.map(item => item.id));
  if (cartUrls.length) openLohacoCartAdds(cartUrls);
}

function skipLohacoSelection() {
  const rows = lohacoSelectCheckedRows();
  if (!rows.length) return;
  const destById = new Map(rows.map(row => [String(row.item.id), shoppingDestFromSelectRow(row)]));
  const items = rows.map(row => row.item);
  queueBulkFulfillment(
    items,
    item => ({ dest: destById.get(String(item.id)) || shoppingListDestForItem(item), productId: '' }),
    `${rows.length}件を買い物リストへ移しました`
  );
  clearLohacoSelectedProductIds(items.map(item => item.id));
}

async function handleFulfillmentItemTap(id) {
  const item = findItemById(id);
  if (!item || !itemPendingMode(item)) return;

  const action = await showActionChoice(
    item.name,
    'このアイテムをどうしますか？',
    [
      { label: 'Selectに戻す', value: 'return-select' },
      { label: '削除する', value: 'remove', danger: true }
    ]
  );
  if (!action) return;

  lastOrderUndo = captureFulfillment(item);
  clearItemPending(item);
  saveAndRender();

  if (action === 'return-select') {
    showUndoToast(`「${item.name}」をSelectに戻しました`);
    showPage('order');
    return;
  }

  showUndoToast(`「${item.name}」をリストから削除しました`);
}

function undoLastOrder() {
  const snaps = undoSnapshots(lastOrderUndo);
  if (!snaps.length) return;
  snaps.forEach(snap => {
    const item = findItemById(snap.id);
    if (item) restoreFulfillment(item, snap);
  });
  lastOrderUndo = null;
  hideUndoToast();
  saveAndRender();
}
