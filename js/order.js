const ORDER_VIEW_LABELS = { shopping: '買い物', receipt: '受け取り' };
const ORDER_EMPTY_MESSAGE = {
  order: '発注が必要なアイテムはありません',
  shopping: '買い物リストは空です',
  receipt: '受け取り待ちはありません'
};
const ORDER_HINT = {
  lohaco: 'LOHACO で買うものにチェックを入れて確定します。残ったものは店舗などの発注へ進みます。',
  place: '商品か購入先を決めて確定します。ネットは注文、店舗は買いものリストへ進みます。'
};
let pendingProductSelect = null;

function orderPlacementDestValue(destSelect) {
  const dest = normalizePurchaseDest(destSelect.value) || '';
  if (!dest || dest === ADD_NEW_VALUE) return '';
  return dest;
}

function orderPlacementButtonLabel(dest) {
  if (!dest) return '確定';
  return destKind(dest) === 'online' ? '注文' : '買いものリストに追加';
}

function syncOrderPlacementButton(btn, destSelect) {
  const dest = orderPlacementDestValue(destSelect);
  btn.disabled = !dest;
  btn.textContent = orderPlacementButtonLabel(dest);
}

async function finishOrderProductRegistration(item, productSelect, created, toastMessage) {
  if (!created) {
    productSelect.value = '';
    return false;
  }
  if (toastMessage) showUndoToast(toastMessage);
  pendingProductSelect = { itemId: item.id, productId: created.id };
  saveAndRender();
  return true;
}

function pendingProductNote(item) {
  const product = findProductById(item.pendingProductId);
  return product ? `<span class="item-last-order">商品: ${product.name}</span>` : '';
}

function appendFulfillItemRow(parent, item, dest, view) {
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
      ${pendingProductNote(item)}
      ${destNote}
      <span class="item-last-order">前回発注: ${lastOrder || 'なし'}</span>
      <span class="order-amount">買う数: ${formatQty(orderAmount, item.unit)}（現在: ${formatQty(item.count, item.unit)} / 必要: ${formatQty(item.target, item.unit)}）</span>
  `;
  const controls = document.createElement('div');
  controls.className = 'controls';
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
  const onlineActions = mountOnlineAccessActions(item, findProductById(item.pendingProductId), dest);
  if (onlineActions) controls.appendChild(onlineActions);
  itemDiv.appendChild(info);
  itemDiv.appendChild(controls);
  parent.appendChild(itemDiv);
}

function bindOrderViewFilters(filterDiv, { includeDestFilters = true } = {}) {
  if (!filterDiv) return orderCategoryFilter;
  filterDiv.innerHTML = '';
  if (includeDestFilters) bindPurchaseDestFilters(filterDiv);
  return bindFilterSelect(filterDiv, 'カテゴリ', allCategories(), orderCategoryFilter, value => {
    orderCategoryFilter = value;
  });
}

function toggleOrderDestGroup(dest) {
  if (orderCollapsedDests.has(dest)) orderCollapsedDests.delete(dest);
  else orderCollapsedDests.add(dest);
  persistOrderCollapsedDests();
  saveAndRender();
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
  const destGroups = groupOrderItemsByDest(items, view);
  if (!destGroups.size) {
    orderDiv.innerHTML = `<div class="empty-message">${ORDER_EMPTY_MESSAGE[view] || ORDER_EMPTY_MESSAGE.shopping}</div>`;
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
        .forEach(item => appendFulfillItemRow(body, item, dest, view));
    });
    group.appendChild(body);
    orderDiv.appendChild(group);
  });
}

function itemsForLohacoSelect() {
  return stockItems.filter(item =>
    needsOrderAction(item) &&
    itemMatchesCategory(item, orderCategoryFilter)
  );
}

function setOrderHint(mode) {
  const hint = document.getElementById('order-hint');
  if (hint) hint.textContent = ORDER_HINT[mode] || ORDER_HINT.place;
}

function setOrderLohacoActionsVisible(visible) {
  const bar = document.getElementById('order-lohaco-actions');
  const page = document.getElementById('page-order');
  if (bar) bar.hidden = !visible;
  if (page) page.classList.toggle('lohaco-select-step', !!visible);
  if (visible) syncLohacoConfirmButton();
}

function syncLohacoConfirmButton() {
  const btn = document.getElementById('confirm-lohaco-select-btn');
  if (!btn) return;
  const n = document.querySelectorAll('#order-list .order-lohaco-check:checked').length;
  btn.disabled = n === 0;
  btn.textContent = n ? `選んだものを LOHACO で注文（${n}）` : '選んだものを LOHACO で注文';
}

function renderOrderItemsByCategory(orderDiv, items, appendRow) {
  const cats = groupOrderItemsByCategory(items);
  const categoryOrder = [...allCategories(), UNSET_CATEGORY_LABEL];
  sortNamesByMaster(cats.keys(), categoryOrder).forEach(cat => {
    const sub = document.createElement('div');
    sub.className = 'order-subgroup-title';
    sub.textContent = cat;
    orderDiv.appendChild(sub);
    cats.get(cat).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'))
      .forEach(item => appendRow(orderDiv, item));
  });
}

function renderPlaceOrderList() {
  const orderDiv = document.getElementById('order-list');
  const filterDiv = document.getElementById('order-filters');
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  if (!stockItems.some(needsOrderAction)) orderLohacoStepDone = false;
  const showLohacoStep = !orderLohacoStepDone;
  orderCategoryFilter = bindOrderViewFilters(filterDiv, { includeDestFilters: !showLohacoStep });
  const items = showLohacoStep ? itemsForLohacoSelect() : itemsForOrderView('order');
  if (!items.length) {
    setOrderHint('place');
    setOrderLohacoActionsVisible(false);
    orderDiv.innerHTML = `<div class="empty-message">${ORDER_EMPTY_MESSAGE.order}</div>`;
    return;
  }
  if (showLohacoStep) {
    setOrderHint('lohaco');
    setOrderLohacoActionsVisible(true);
    renderOrderItemsByCategory(orderDiv, items, appendLohacoSelectRow);
    return;
  }
  setOrderHint('place');
  setOrderLohacoActionsVisible(false);
  renderOrderItemsByCategory(orderDiv, items, appendPlaceOrderRow);
}

function renderFulfillmentList() {
  const orderDiv = document.getElementById('fulfill-list');
  const filterDiv = document.getElementById('fulfill-filters');
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  updateOrderSubnav();
  orderCategoryFilter = bindOrderViewFilters(filterDiv);
  renderGroupedFulfillItems(orderDiv, itemsForOrderView(orderFulfillmentView), orderFulfillmentView);
}

function renderOrderList() {
  renderPlaceOrderList();
  renderFulfillmentList();
  const fulfillNav = document.getElementById('nav-fulfillment');
  if (fulfillNav) {
    const n = fulfillmentCounts().shopping + fulfillmentCounts().receipt;
    fulfillNav.textContent = n ? `買い物（${n}）` : '買い物';
  }
  const orderNav = document.getElementById('nav-order');
  if (orderNav) {
    const n = fulfillmentCounts().order;
    orderNav.textContent = n ? `発注（${n}）` : '発注';
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

async function quickRegisterProductFromOrder(item, destHint) {
  const name = await showPrompt('商品名', item.name || '');
  if (!name || !String(name).trim()) return null;
  const dests = defaultDestsForNewProduct(item.id, destHint);
  if (!dests.length) {
    alert('先に購入先を選ぶか、アイテムに購入先を付けてください。');
    return null;
  }
  dests.forEach(dest => ensurePurchaseDest(dest));
  const product = createCatalogProduct({
    name: String(name).trim(),
    itemId: item.id,
    dests
  });
  showUndoToast(`「${product.name}」を登録しました。確定で発注できます`);
  return product;
}

function confirmOrderPlacement(id, productId, destValue) {
  const item = findItemById(id);
  if (!item) return;
  const product = findProductById(productId);
  let dest = destValue;
  if (product) {
    const dests = product.purchaseDests;
    if (!dests.length) {
      alert('この商品に購入先がありません。設定で追加してください。');
      return;
    }
    dest = dests.includes(dest) ? dest : (dests.length === 1 ? dests[0] : dest);
    if (!dests.includes(dest)) {
      alert('商品の購入先を選んでください。');
      return;
    }
  } else {
    dest = normalizePurchaseDest(dest) || '';
    if (!dest || dest === ADD_NEW_VALUE) {
      alert('商品を選ぶか、購入先を入力してください。');
      return;
    }
  }
  lastOrderUndo = captureFulfillment(item);
  const mode = queueItemFulfillment(item, dest, product ? product.id : '');
  saveAndRender();
  showUndoToast(mode === 'receipt'
    ? `「${item.name}」を受け取り待ちにしました`
    : `「${item.name}」を買い物リストへ移しました`);
}

function confirmLohacoSelection() {
  const checked = Array.from(document.querySelectorAll('#order-list .order-lohaco-check:checked'));
  const items = checked.map(input => findItemById(input.dataset.itemId)).filter(Boolean);
  if (!items.length) return;
  ensurePurchaseDest(LOHACO_DEST_NAME, 'online');
  persistMasters();
  lastOrderUndo = items.map(item => captureFulfillment(item));
  items.forEach(item => {
    queueItemFulfillment(item, LOHACO_DEST_NAME, lohacoProductIdForItem(item));
  });
  orderLohacoStepDone = true;
  saveAndRender();
  showUndoToast(`${items.length}件を受け取り待ちにしました`);
}

function skipLohacoSelection() {
  orderLohacoStepDone = true;
  saveAndRender();
}

function completeFulfillment(id) {
  const item = findItemById(id);
  if (!item) return;
  lastOrderUndo = captureFulfillment(item);
  const wasReceipt = itemPendingMode(item) === 'receipt';
  lastOrderUndo.historyId = completeItemFulfillment(item);
  saveAndRender();
  showUndoToast(wasReceipt ? `「${item.name}」を受け取り済みにしました` : `「${item.name}」を購入済みにしました`);
}

function undoLastOrder() {
  const snaps = undoSnapshots(lastOrderUndo);
  if (!snaps.length) return;
  const wasLohacoBulk = Array.isArray(lastOrderUndo);
  snaps.forEach(snap => {
    const item = findItemById(snap.id);
    if (item) restoreFulfillment(item, snap);
  });
  if (wasLohacoBulk) orderLohacoStepDone = false;
  lastOrderUndo = null;
  hideUndoToast();
  saveAndRender();
}
