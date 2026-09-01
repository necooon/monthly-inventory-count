function renderOrderList() {
  const st = S();
  const orderDiv = document.getElementById('order-list');
  const filterDiv = document.getElementById('order-filters');
  orderDiv.innerHTML = '';
  if (filterDiv) {
    filterDiv.innerHTML = '';
    st.filters.order.category = bindFilterSelect(filterDiv, 'カテゴリ', I.allCategories(), st.filters.order.category, value => { st.filters.order.category = value; });
  }

  const itemsToOrder = st.stockItems.filter(item => I.needsOrder(item) && I.itemMatchesCategory(item, st.filters.order.category));

  if (itemsToOrder.length === 0) {
    orderDiv.innerHTML = '<div class="empty-message">発注が必要なアイテムはありません 🎉</div>';
    return;
  }

  const groups = new Map();
  itemsToOrder.forEach(item => {
    const key = I.normalizeCategory(item.category) || C.UNSET_CATEGORY_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const categoryOrder = [...I.allCategories(), C.UNSET_CATEGORY_LABEL];
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    const sa = ia < 0 ? 999 : ia;
    const sb = ib < 0 ? 999 : ib;
    return sa - sb || a.localeCompare(b, 'ja');
  });

  keys.forEach(key => {
    const group = document.createElement('div');
    group.className = 'order-group';
    const title = document.createElement('div');
    title.className = 'order-group-title';
    title.textContent = key;
    group.appendChild(title);
    groups.get(key).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja')).forEach(item => {
      const orderAmount = Math.max(0, item.target - item.count);
      const itemDiv = document.createElement('div');
      itemDiv.className = 'item empty order-item';
      const lastOrder = I.formatLastOrder(item.lastOrderedOn);
      itemDiv.innerHTML = `
        <div class="item-info">
          <span class="item-name"><span class="item-name-text">${item.name}</span></span>
          <span class="item-last-order">前回発注: ${lastOrder || 'なし'}</span>
          <span class="order-amount">買う数: ${formatQty(orderAmount, item.unit)}（現在: ${formatQty(item.count, item.unit)} / 必要: ${formatQty(item.target, item.unit)}）</span>
        </div>
        <div class="controls">
          <label class="order-check-label">
            <input type="checkbox" class="order-check" data-item-id="${item.id}" onchange="markAsOrdered(this.dataset.itemId)">
            発注済み
          </label>
        </div>
      `;
      group.appendChild(itemDiv);
    });
    orderDiv.appendChild(group);
  });
}

function hideUndoToast() {
  const st = S();
  const toast = document.getElementById('undo-toast');
  if (toast) toast.classList.remove('open');
  if (st.ui.undoToastTimer) {
    clearTimeout(st.ui.undoToastTimer);
    st.ui.undoToastTimer = null;
  }
}

function showUndoToast(message) {
  const st = S();
  const toast = document.getElementById('undo-toast');
  const text = document.getElementById('undo-toast-text');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('open');
  if (st.ui.undoToastTimer) clearTimeout(st.ui.undoToastTimer);
  st.ui.undoToastTimer = setTimeout(() => {
    st.ui.lastOrderUndo = null;
    hideUndoToast();
  }, 8000);
}

function markAsOrdered(id) {
  const st = S();
  const item = I.findItemById(id);
  if (!item) return;
  st.ui.lastOrderUndo = {
    id: item.id,
    count: item.count,
    entered: item.entered,
    lastOrderedOn: item.lastOrderedOn
  };
  item.count = item.target;
  item.entered = true;
  item.lastOrderedOn = I.todayIsoDate();
  saveAndRender();
  showUndoToast(`「${item.name}」を発注済みにしました`);
}

function undoLastOrder() {
  const st = S();
  if (!st.ui.lastOrderUndo) return;
  const item = I.findItemById(st.ui.lastOrderUndo.id);
  if (item) {
    item.count = st.ui.lastOrderUndo.count;
    item.entered = st.ui.lastOrderUndo.entered;
    item.lastOrderedOn = st.ui.lastOrderUndo.lastOrderedOn;
  }
  st.ui.lastOrderUndo = null;
  hideUndoToast();
  saveAndRender();
}

window.markAsOrdered = markAsOrdered;
window.undoLastOrder = undoLastOrder;
