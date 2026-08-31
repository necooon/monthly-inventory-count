const ORDER_VIEW_LABELS = { shopping: '買い物', receipt: '受け取り' };
const ORDER_EMPTY_MESSAGE = {
  order: '発注が必要なアイテムはありません 🎉',
  shopping: '買い物リストは空です',
  receipt: '受け取り待ちはありません'
};
let pendingProductSelect = null;

function productOptionLabel(product) {
  const dests = productPurchaseDestNames(product);
  if (!dests.length) return `${product.name}（購入先なし）`;
  return `${product.name} — ${dests.join('、')}`;
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
  itemDiv.appendChild(info);
  itemDiv.appendChild(controls);
  parent.appendChild(itemDiv);
}

function appendPlaceOrderRow(parent, item) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item empty order-item';
  itemDiv.dataset.orderItem = item.id;
  const products = productsForItem(item.id);
  const info = document.createElement('div');
  info.className = 'item-info';
  const lastOrder = formatLastOrder(item.lastOrderedOn);
  info.innerHTML = `
      <span class="item-name"><span class="item-name-text">${item.name}</span></span>
      <span class="item-last-order">前回発注: ${lastOrder || 'なし'}</span>
      <span class="order-amount">買う数: ${formatQty(itemOrderQty(item), item.unit)}（現在: ${formatQty(item.count, item.unit)} / 必要: ${formatQty(item.target, item.unit)}）</span>
  `;
  const productLabel = document.createElement('label');
  productLabel.className = 'order-field-label';
  productLabel.textContent = '商品';
  const productSelect = document.createElement('select');
  productSelect.className = 'order-product-select';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = products.length ? '選ばない（購入先を入力）' : '未登録（購入先を入力）';
  productSelect.appendChild(noneOpt);
  products.forEach(product => {
    const opt = document.createElement('option');
    opt.value = product.id;
    opt.textContent = productOptionLabel(product);
    productSelect.appendChild(opt);
  });
  const addOpt = document.createElement('option');
  addOpt.value = ADD_NEW_VALUE;
  addOpt.textContent = '＋ この場で登録（名前だけ）';
  productSelect.appendChild(addOpt);
  const destLabel = document.createElement('label');
  destLabel.className = 'order-field-label';
  destLabel.textContent = '購入先';
  const destSelect = document.createElement('select');
  destSelect.className = 'order-dest-select';
  const syncOrderDestFields = () => {
    const product = findProductById(productSelect.value);
    const names = product
      ? productPurchaseDestNames(product)
      : (itemPurchaseDests(item).length ? itemPurchaseDests(item) : allPurchaseDests());
    const prev = destSelect.value;
    destSelect.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = product ? '商品の購入先を選ぶ' : '購入先を選ぶ';
    destSelect.appendChild(empty);
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name}（${destKindLabel(name)}）`;
      destSelect.appendChild(opt);
    });
    if (!product) {
      const add = document.createElement('option');
      add.value = ADD_NEW_VALUE;
      add.textContent = '＋ 新しい購入先を入力';
      destSelect.appendChild(add);
    }
    if (names.includes(prev)) destSelect.value = prev;
    else if (product && names.length === 1) destSelect.value = names[0];
    else if (!product && names.length === 1) destSelect.value = names[0];
  };
  productSelect.onchange = async () => {
    if (productSelect.value === ADD_NEW_VALUE) {
      const created = await quickRegisterProductFromOrder(item, destSelect.value);
      if (!created) {
        productSelect.value = '';
        syncOrderDestFields();
        return;
      }
      pendingProductSelect = { itemId: item.id, productId: created.id };
      saveAndRender();
      return;
    }
    syncOrderDestFields();
  };
  destSelect.onchange = async () => {
    if (destSelect.value !== ADD_NEW_VALUE) return;
    const name = await showPrompt('新しい購入先');
    if (!name || !String(name).trim()) {
      destSelect.value = '';
      return;
    }
    const kind = await pickPurchaseDestKind();
    if (!kind) {
      destSelect.value = '';
      return;
    }
    const dest = ensurePurchaseDest(String(name).trim(), kind);
    persistMasters();
    syncOrderDestFields();
    destSelect.value = dest;
  };
  syncOrderDestFields();
  if (pendingProductSelect && String(pendingProductSelect.itemId) === String(item.id)) {
    const keepId = pendingProductSelect.productId;
    pendingProductSelect = null;
    if ([...productSelect.options].some(o => o.value === keepId)) {
      productSelect.value = keepId;
      syncOrderDestFields();
    }
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'order-action-btn';
  btn.textContent = '確定';
  btn.onclick = () => confirmOrderPlacement(item.id, productSelect.value, destSelect.value);
  const controls = document.createElement('div');
  controls.className = 'order-place-fields';
  controls.appendChild(productLabel);
  controls.appendChild(productSelect);
  controls.appendChild(destLabel);
  controls.appendChild(destSelect);
  controls.appendChild(btn);
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

function renderPlaceOrderList() {
  const orderDiv = document.getElementById('order-list');
  const filterDiv = document.getElementById('order-filters');
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  if (filterDiv) {
    filterDiv.innerHTML = '';
    bindPurchaseDestFilters(filterDiv);
    orderCategoryFilter = bindFilterSelect(filterDiv, 'カテゴリ', allCategories(), orderCategoryFilter, value => { orderCategoryFilter = value; });
  }
  const items = itemsForOrderView('order');
  if (!items.length) {
    orderDiv.innerHTML = `<div class="empty-message">${ORDER_EMPTY_MESSAGE.order}</div>`;
    return;
  }
  const cats = groupOrderItemsByCategory(items);
  const categoryOrder = [...allCategories(), UNSET_CATEGORY_LABEL];
  sortNamesByMaster(cats.keys(), categoryOrder).forEach(cat => {
    const sub = document.createElement('div');
    sub.className = 'order-subgroup-title';
    sub.textContent = cat;
    orderDiv.appendChild(sub);
    cats.get(cat).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'))
      .forEach(item => appendPlaceOrderRow(orderDiv, item));
  });
}

function renderFulfillmentList() {
  const orderDiv = document.getElementById('fulfill-list');
  const filterDiv = document.getElementById('fulfill-filters');
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  updateOrderSubnav();
  if (filterDiv) {
    filterDiv.innerHTML = '';
    bindPurchaseDestFilters(filterDiv);
    orderCategoryFilter = bindFilterSelect(filterDiv, 'カテゴリ', allCategories(), orderCategoryFilter, value => { orderCategoryFilter = value; });
  }
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
  if (!lastOrderUndo) return;
  const item = findItemById(lastOrderUndo.id);
  if (item) restoreFulfillment(item, lastOrderUndo);
  lastOrderUndo = null;
  hideUndoToast();
  saveAndRender();
}
