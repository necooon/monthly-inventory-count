const FULFILL_COMPLETE_LABELS = { shopping: '買った', receipt: '受け取り済み' };
const FULFILL_PAGES = {
  shopping: {
    page: 'shopping',
    mode: 'shopping',
    navId: 'nav-shopping',
    navLabel: 'Shopping',
    listId: 'shopping-list',
    filterId: 'shopping-filters',
    actionsId: 'shopping-complete-actions',
    buttonId: 'confirm-shopping-complete-btn'
  },
  pickup: {
    page: 'pickup',
    mode: 'receipt',
    navId: 'nav-pickup',
    navLabel: 'Pick Up',
    listId: 'pickup-list',
    filterId: 'pickup-filters',
    actionsId: 'pickup-complete-actions',
    buttonId: 'confirm-pickup-complete-btn'
  }
};

function appendFulfillChecklistRow(parent, item, view) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item order-place-item order-lohaco-item order-fulfill-card';
  itemDiv.dataset.itemId = item.id;
  const label = item.name;

  const row = document.createElement('div');
  row.className = 'order-lohaco-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'order-lohaco-check';
  input.dataset.itemId = item.id;
  input.setAttribute('aria-label', `${label}を選ぶ`);
  input.checked = false;
  input.onclick = event => event.stopPropagation();
  input.onchange = () => syncFulfillCompleteButton(view);

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

function fulfillPage(pageKey) {
  return FULFILL_PAGES[pageKey] || FULFILL_PAGES.shopping;
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

function setFulfillCompleteActionsVisible(pageKey, visible) {
  const page = fulfillPage(pageKey);
  const bar = document.getElementById(page.actionsId);
  const pageEl = document.getElementById(`page-${page.page}`);
  if (bar) bar.hidden = !visible;
  if (pageEl) pageEl.classList.toggle('fulfill-complete-step', !!visible);
  if (visible) syncFulfillCompleteButton(page.mode);
}

function fulfillCheckedItems(mode) {
  const page = Object.values(FULFILL_PAGES).find(entry => entry.mode === mode) || FULFILL_PAGES.shopping;
  const items = [];
  const seen = new Set();
  document.querySelectorAll(`#${page.listId} .order-lohaco-check:checked`).forEach(input => {
    const item = findItemById(input.dataset.itemId);
    if (!item || itemPendingMode(item) !== mode) return;
    const id = String(item.id);
    if (seen.has(id)) return;
    seen.add(id);
    items.push(item);
  });
  return items;
}

function syncFulfillCompleteButton(mode) {
  const page = Object.values(FULFILL_PAGES).find(entry => entry.mode === mode) || FULFILL_PAGES.shopping;
  const n = fulfillCheckedItems(page.mode).length;
  const btn = document.getElementById(page.buttonId);
  if (!btn) return;
  const label = FULFILL_COMPLETE_LABELS[page.mode] || FULFILL_COMPLETE_LABELS.shopping;
  btn.disabled = n === 0;
  btn.textContent = labeledCount(label, n);
}

function completeCheckedFulfillmentItems(pageKey) {
  const page = fulfillPage(pageKey);
  const mode = page.mode;
  const items = fulfillCheckedItems(mode);
  if (!items.length) return;
  lastOrderUndo = items.map(item => {
    const snap = captureFulfillment(item);
    snap.historyId = completeItemFulfillment(item);
    return snap;
  });
  saveAndRender();
  const done = mode === 'receipt' ? '受け取り済みにしました' : '買いました';
  const name = items[0].name;
  showUndoToast(items.length === 1 ? `「${name}」を${done}` : `${items.length}件を${done}`);
}

function renderFulfillmentPage(pageKey) {
  const page = fulfillPage(pageKey);
  const orderDiv = document.getElementById(page.listId);
  const filterDiv = document.getElementById(page.filterId);
  if (!orderDiv) return;
  orderDiv.innerHTML = '';
  orderCategoryFilter = bindOrderViewFilters(filterDiv);
  renderGroupedFulfillItems(orderDiv, itemsForFulfillmentView(page.mode), page.mode);
  const hasRows = !!orderDiv.querySelector('.order-lohaco-check');
  setFulfillCompleteActionsVisible(page.page, hasRows);
}

function updateFulfillNavCounts(counts) {
  Object.values(FULFILL_PAGES).forEach(page => {
    setNavCount(document.getElementById(page.navId), page.navLabel, counts[page.mode]);
  });
}
