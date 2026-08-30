const ORDER_VIEW_LABELS = { order: '発注', shopping: '買い物', receipt: '受け取り' };
const ORDER_EMPTY_MESSAGE = {
  order: '発注が必要なアイテムはありません 🎉',
  shopping: '買い物リストは空です',
  receipt: '受け取り待ちはありません'
};

function appendOrderItemRow(parent, item, dest, view) {
  const orderAmount = itemOrderQty(item);
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item empty order-item';
  const lastOrder = formatLastOrder(item.lastOrderedOn);
  const destLabel = dest && dest !== UNSET_PURCHASE_DEST_LABEL ? dest : '';
  const destNote = destLabel ? `<span class="item-last-order">購入先: ${destLabel}（${destKindLabel(destLabel)}）</span>` : '';
  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = `
      <span class="item-name"><span class="item-name-text">${item.name}</span></span>
      ${destNote}
      <span class="item-last-order">前回発注: ${lastOrder || 'なし'}</span>
      <span class="order-amount">買う数: ${formatQty(orderAmount, item.unit)}（現在: ${formatQty(item.count, item.unit)} / 必要: ${formatQty(item.target, item.unit)}）</span>
  `;
  const controls = document.createElement('div');
  controls.className = 'controls';
  if (view === 'order') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'order-action-btn';
    btn.textContent = destKind(dest) === 'online' ? '注文済み' : '買い物リストへ';
    btn.onclick = () => queueFulfillment(item.id, dest);
    controls.appendChild(btn);
  } else {
    const label = document.createElement('label');
    label.className = 'order-check-label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'order-check';
    input.onchange = () => completeFulfillment(item.id);
    const text = document.createElement('span');
    text.textContent = view === 'receipt' ? '受け取り済み' : '買った';
    label.appendChild(input);
    label.appendChild(text);
    controls.appendChild(label);
  }
  itemDiv.appendChild(info);
  itemDiv.appendChild(controls);
  parent.appendChild(itemDiv);
}

function toggleOrderDestGroup(dest) {
  if (orderCollapsedDests.has(dest)) orderCollapsedDests.delete(dest);
  else orderCollapsedDests.add(dest);
  persistOrderCollapsedDests();
  saveAndRender();
}

function setOrderFulfillmentView(view) {
  if (view !== 'order' && view !== 'shopping' && view !== 'receipt') return;
  orderFulfillmentView = view;
  persistOrderFulfillmentView();
  saveAndRender();
}

function updateOrderSubnav() {
  const counts = fulfillmentCounts();
  ['order', 'shopping', 'receipt'].forEach(view => {
    const btn = document.getElementById('order-view-' + view);
    if (!btn) return;
    const on = orderFulfillmentView === view;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    const count = counts[view];
    btn.textContent = count ? `${ORDER_VIEW_LABELS[view]}（${count}）` : ORDER_VIEW_LABELS[view];
  });
}

function renderGroupedOrderItems(orderDiv, items, view) {
  const destGroups = groupOrderItemsByDest(items, view);
  if (!destGroups.size) {
    orderDiv.innerHTML = `<div class="empty-message">${ORDER_EMPTY_MESSAGE[view] || ORDER_EMPTY_MESSAGE.order}</div>`;
    return;
  }

  const destOrder = [...allPurchaseDests(), UNSET_PURCHASE_DEST_LABEL];
  const categoryOrder = [...allCategories(), UNSET_CATEGORY_LABEL];
  sortNamesByMaster(destGroups.keys(), destOrder).forEach(dest => {
    const cats = destGroups.get(dest);
    const destCount = [...cats.values()].reduce((n, list) => n + list.length, 0);
    const collapsed = orderCollapsedDests.has(dest);
    const group = document.createElement('div');
    group.className = `order-group${collapsed ? ' collapsed' : ''}`;
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
    sortNamesByMaster(cats.keys(), categoryOrder).forEach(cat => {
      const sub = document.createElement('div');
      sub.className = 'order-subgroup-title';
      sub.textContent = cat;
      body.appendChild(sub);
      cats.get(cat).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'))
        .forEach(item => appendOrderItemRow(body, item, dest, view));
    });
    group.appendChild(body);
    orderDiv.appendChild(group);
  });
}

function renderOrderList() {
  const orderDiv = document.getElementById('order-list');
  const filterDiv = document.getElementById('order-filters');
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  updateOrderSubnav();
  if (filterDiv) {
    filterDiv.innerHTML = '';
    bindPurchaseDestFilters(filterDiv);
    orderCategoryFilter = bindFilterSelect(filterDiv, 'カテゴリ', allCategories(), orderCategoryFilter, value => { orderCategoryFilter = value; });
  }
  renderGroupedOrderItems(orderDiv, itemsForOrderView(orderFulfillmentView), orderFulfillmentView);
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

function queueFulfillment(id, dest) {
  const item = findItemById(id);
  if (!item) return;
  lastOrderUndo = captureFulfillment(item);
  const mode = queueItemFulfillment(item, dest);
  saveAndRender();
  showUndoToast(mode === 'receipt'
    ? `「${item.name}」を受け取り待ちにしました`
    : `「${item.name}」を買い物リストへ移しました`);
}

function completeFulfillment(id) {
  const item = findItemById(id);
  if (!item) return;
  lastOrderUndo = captureFulfillment(item);
  const wasReceipt = itemPendingMode(item) === 'receipt';
  fillItemToTarget(item);
  saveAndRender();
  showUndoToast(wasReceipt ? `「${item.name}」を受け取り済みにしました` : `「${item.name}」を購入済みにしました`);
}

function undoLastOrder() {
  if (!lastOrderUndo) return;
  const item = findItemById(lastOrderUndo.id);
  if (item) restoreFulfillment(item, lastOrderUndo);
  lastOrderUndo = null;
  hideUndoToast();
  saveAndRender();
}
