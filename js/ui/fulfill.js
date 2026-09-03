const FULFILL_PAGES = [
  {
    page: 'shopping',
    mode: 'shopping',
    navLabel: 'Shopping List',
    completeLabel: '買った',
    doneLabel: '買いました',
    emptyMessage: '買い物リストは空です',
    layoutOptions: { shoppingLayout: true }
  },
  {
    page: 'pickup',
    mode: 'receipt',
    navLabel: 'Pick Up',
    completeLabel: '受け取り済み',
    doneLabel: '受け取り済みにしました',
    emptyMessage: '受け取り待ちはありません',
    layoutOptions: { receiptLayout: true }
  }
];

function fulfillPage(pageKey) {
  return FULFILL_PAGES.find(page => page.page === pageKey) || FULFILL_PAGES[0];
}

function fulfillEls(page) {
  const key = page.page;
  return {
    pageEl: document.getElementById(`page-${key}`),
    nav: document.getElementById(`nav-${key}`),
    list: document.getElementById(`${key}-list`),
    filters: document.getElementById(`${key}-filters`),
    actions: document.getElementById(`${key}-complete-actions`),
    button: document.getElementById(`confirm-${key}-complete-btn`)
  };
}

function fulfillRowLabel(item, page) {
  if (page.mode !== 'receipt') return item.name;
  const productName = pendingProductName(item);
  return productName && productName !== item.name ? `${item.name}、${productName}` : item.name;
}

function appendFulfillChecklistRow(parent, item, page) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item order-place-item order-lohaco-item order-fulfill-card';
  itemDiv.dataset.itemId = item.id;
  const label = fulfillRowLabel(item, page);

  const row = document.createElement('div');
  row.className = 'order-lohaco-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'order-lohaco-check';
  input.dataset.itemId = item.id;
  input.setAttribute('aria-label', `${label}を選ぶ`);
  input.checked = false;
  input.onclick = event => event.stopPropagation();
  input.onchange = () => syncFulfillCompleteButton(page);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'order-lohaco-main';
  trigger.setAttribute('aria-label', `${label}の操作`);
  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = orderPlaceInfoHtml(item, page.layoutOptions);
  trigger.appendChild(info);
  trigger.onclick = () => handleFulfillmentItemTap(item.id);

  row.appendChild(input);
  row.appendChild(trigger);
  itemDiv.appendChild(row);
  parent.appendChild(itemDiv);
}

function renderGroupedFulfillItems(list, items, page) {
  const destGroups = groupItemsByDest(items, pendingDestLabel);
  if (!destGroups.size) {
    list.innerHTML = `<div class="empty-message">${page.emptyMessage}</div>`;
    return;
  }
  renderDestCategoryGroups(
    list,
    destGroups,
    [...allPurchaseDests(), UNSET_PURCHASE_DEST_LABEL],
    (parent, item) => appendFulfillChecklistRow(parent, item, page)
  );
}

function setFulfillCompleteActionsVisible(page, visible) {
  const els = fulfillEls(page);
  if (els.actions) els.actions.hidden = !visible;
  if (els.pageEl) els.pageEl.classList.toggle('fulfill-complete-step', !!visible);
  if (visible) syncFulfillCompleteButton(page);
}

function fulfillCheckedItems(page) {
  const { list } = fulfillEls(page);
  const items = [];
  const seen = new Set();
  if (!list) return items;
  list.querySelectorAll('.order-lohaco-check:checked').forEach(input => {
    const item = findItemById(input.dataset.itemId);
    if (!item || itemPendingMode(item) !== page.mode) return;
    const id = String(item.id);
    if (seen.has(id)) return;
    seen.add(id);
    items.push(item);
  });
  return items;
}

function syncFulfillCompleteButton(page) {
  const { button } = fulfillEls(page);
  if (!button) return;
  const n = fulfillCheckedItems(page).length;
  button.disabled = n === 0;
  button.textContent = labeledCount(page.completeLabel, n);
}

function completeCheckedFulfillmentItems(pageKey) {
  const page = fulfillPage(pageKey);
  const items = fulfillCheckedItems(page);
  if (!items.length) return;
  lastOrderUndo = items.map(item => {
    const snap = captureFulfillment(item);
    snap.historyId = completeItemFulfillment(item);
    return snap;
  });
  saveAndRender();
  const name = fulfillRowLabel(items[0], page);
  showUndoToast(items.length === 1 ? `「${name}」を${page.doneLabel}` : `${items.length}件を${page.doneLabel}`);
}

function renderFulfillmentPage(page) {
  const els = fulfillEls(page);
  if (!els.list) return;
  els.list.innerHTML = '';
  orderCategoryFilter = bindOrderViewFilters(els.filters);
  renderGroupedFulfillItems(els.list, itemsForFulfillmentView(page.mode), page);
  setFulfillCompleteActionsVisible(page, !!els.list.querySelector('.order-lohaco-check'));
}

function updateFulfillNavCounts(counts) {
  FULFILL_PAGES.forEach(page => {
    const { nav } = fulfillEls(page);
    if (nav) nav.textContent = labeledCount(page.navLabel, counts[page.mode]);
  });
}

function renderFulfillmentPages() {
  FULFILL_PAGES.forEach(renderFulfillmentPage);
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
