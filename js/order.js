const ORDER_VIEW_LABELS = { shopping: '買い物', receipt: '受け取り' };
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
const FULFILL_COMPLETE_LABELS = { shopping: '買った', receipt: '受け取り済み' };
let selectCollapsedItemIds = new Set();

function pendingProductName(item) {
  const product = findProductById(item.pendingProductId);
  return product && product.name ? product.name : '';
}

function fulfillRowLabel(item, view) {
  if (view !== 'receipt') return item.name;
  const productName = pendingProductName(item);
  return productName && productName !== item.name ? `${item.name}、${productName}` : item.name;
}

function appendFulfillChecklistRow(parent, item, view) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item order-place-item order-lohaco-item order-fulfill-card';
  itemDiv.dataset.itemId = item.id;
  const label = fulfillRowLabel(item, view);

  const row = document.createElement('div');
  row.className = 'order-lohaco-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'order-lohaco-check';
  input.dataset.itemId = item.id;
  input.setAttribute('aria-label', `${label}を選ぶ`);
  input.checked = false;
  input.onclick = event => event.stopPropagation();
  input.onchange = syncFulfillCompleteButton;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'order-lohaco-main';
  trigger.setAttribute('aria-label', `${label}の操作`);
  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = orderPlaceInfoHtml(item, view === 'receipt' ? { receiptLayout: true } : { shoppingLayout: true });
  trigger.appendChild(info);
  trigger.onclick = () => handleFulfillmentItemTap(item.id);

  row.appendChild(input);
  row.appendChild(trigger);
  itemDiv.appendChild(row);
  parent.appendChild(itemDiv);
}

function bindOrderViewFilters(filterDiv) {
  if (!filterDiv) return orderCategoryFilter;
  filterDiv.innerHTML = '';
  return bindFilterSelect(filterDiv, 'カテゴリ', allCategories(), orderCategoryFilter, value => {
    orderCategoryFilter = value;
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

function renderDestCategoryGroups(parent, destGroups, destOrder, appendItem) {
  sortNamesByMaster(destGroups.keys(), destOrder).forEach(dest => {
    const cats = destGroups.get(dest);
    appendOrderDestGroup(parent, dest, destCategoryGroupCount(cats), body => {
      appendCategoryItemRows(body, cats, (rowParent, item) => appendItem(rowParent, item, dest));
    });
  });
}

function appendOrderDestGroup(parent, dest, destCount, fillBody) {
  const collapsed = orderCollapsedDests.has(dest);
  const group = document.createElement('div');
  group.className = `order-group${collapsed ? ' collapsed' : ''}`;
  group.dataset.dest = dest;
  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'order-group-title';
  title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  title.setAttribute('aria-label', `${dest}、${destCount}件`);
  title.innerHTML = `<span class="order-group-chevron" aria-hidden="true">${collapsed ? '▶' : '▼'}</span><span>${dest}</span><span class="order-group-count">${destCount}件</span>`;
  title.onclick = () => toggleOrderDestGroup(dest);
  group.appendChild(title);
  const body = document.createElement('div');
  body.className = 'order-group-items';
  fillBody(body);
  group.appendChild(body);
  parent.appendChild(group);
}

function setOrderFulfillmentView(view) {
  if (view !== 'shopping' && view !== 'receipt') return;
  orderFulfillmentView = view;
  persistOrderFulfillmentView();
  saveAndRender();
}

function updateOrderSubnav() {
  const counts = fulfillmentCounts();
  ['shopping', 'receipt'].forEach(view => {
    const btn = document.getElementById('order-view-' + view);
    if (!btn) return;
    const on = orderFulfillmentView === view;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    const count = counts[view];
    btn.textContent = count ? `${ORDER_VIEW_LABELS[view]}（${count}）` : ORDER_VIEW_LABELS[view];
  });
}

function renderGroupedFulfillItems(orderDiv, items, view) {
  const destGroups = groupItemsByDest(items, pendingDestLabel);
  if (!destGroups.size) {
    orderDiv.innerHTML = `<div class="empty-message">${ORDER_EMPTY_MESSAGE[view] || ORDER_EMPTY_MESSAGE.shopping}</div>`;
    return;
  }
  renderDestCategoryGroups(
    orderDiv,
    destGroups,
    [...allPurchaseDests(), UNSET_PURCHASE_DEST_LABEL],
    (parent, item) => appendFulfillChecklistRow(parent, item, view)
  );
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

function setFulfillCompleteActionsVisible(visible) {
  const bar = document.getElementById('fulfill-complete-actions');
  const page = document.getElementById('page-fulfillment');
  if (bar) bar.hidden = !visible;
  if (page) page.classList.toggle('fulfill-complete-step', !!visible);
  if (visible) syncFulfillCompleteButton();
}

function fulfillCheckedItems() {
  const mode = orderFulfillmentView;
  const items = [];
  const seen = new Set();
  document.querySelectorAll('#fulfill-list .order-lohaco-check:checked').forEach(input => {
    const item = findItemById(input.dataset.itemId);
    if (!item || itemPendingMode(item) !== mode) return;
    const id = String(item.id);
    if (seen.has(id)) return;
    seen.add(id);
    items.push(item);
  });
  return items;
}

function syncFulfillCompleteButton() {
  const n = fulfillCheckedItems().length;
  const btn = document.getElementById('confirm-fulfill-complete-btn');
  if (!btn) return;
  const label = FULFILL_COMPLETE_LABELS[orderFulfillmentView] || FULFILL_COMPLETE_LABELS.shopping;
  btn.disabled = n === 0;
  btn.textContent = labeledCount(label, n);
}

function completeCheckedFulfillmentItems() {
  const mode = orderFulfillmentView;
  const items = fulfillCheckedItems();
  if (!items.length) return;
  lastOrderUndo = items.map(item => {
    const snap = captureFulfillment(item);
    snap.historyId = completeItemFulfillment(item);
    return snap;
  });
  saveAndRender();
  const done = mode === 'receipt' ? '受け取り済みにしました' : '買いました';
  const name = fulfillRowLabel(items[0], mode);
  showUndoToast(items.length === 1 ? `「${name}」を${done}` : `${items.length}件を${done}`);
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

function renderFulfillmentList() {
  const orderDiv = document.getElementById('fulfill-list');
  const filterDiv = document.getElementById('fulfill-filters');
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  updateOrderSubnav();
  orderCategoryFilter = bindOrderViewFilters(filterDiv);
  const view = orderFulfillmentView;
  renderGroupedFulfillItems(orderDiv, itemsForFulfillmentView(view), view);
  const hasRows = !!orderDiv.querySelector('.order-lohaco-check');
  setFulfillCompleteActionsVisible(hasRows);
}

function renderOrderList() {
  renderPlaceOrderList();
  renderFulfillmentList();
  const counts = fulfillmentCounts();
  const fulfillNav = document.getElementById('nav-fulfillment');
  if (fulfillNav) {
    const n = counts.shopping + counts.receipt;
    fulfillNav.textContent = n ? `Stock（${n}）` : 'Stock';
  }
  const orderNav = document.getElementById('nav-order');
  if (orderNav) {
    orderNav.textContent = counts.order ? `Select（${counts.order}）` : 'Select';
  }
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
