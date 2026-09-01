function getCatalogItems() {
  const cat = S().filters.catalog;
  const items = S().stockItems.filter(item =>
    I.itemMatchesCyclePlace(item, cat.cycle, cat.place) &&
    I.itemMatchesCategory(item, cat.category)
  );
  return items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
}

function renderItemsCatalog() {
  const st = S();
  const cat = st.filters.catalog;
  const listDiv = document.getElementById('item-catalog-list');
  const filterDiv = document.getElementById('items-filters');
  if (!listDiv || !filterDiv) return;
  filterDiv.innerHTML = '';
  cat.cycle = bindFilterSelect(filterDiv, 'チェック頻度', st.masters.cycles, cat.cycle, value => { cat.cycle = value; });
  cat.category = bindFilterSelect(filterDiv, 'カテゴリ', I.allCategories(), cat.category, value => { cat.category = value; });
  cat.place = bindFilterSelect(filterDiv, '場所', [C.UNSET_PLACE_FILTER, ...st.masters.places], cat.place, value => { cat.place = value; });
  listDiv.innerHTML = '';
  const items = getCatalogItems();
  if (items.length === 0) {
    listDiv.innerHTML = '<div class="empty-message">アイテムがありません。下のボタンから追加してください。チェック頻度と場所は、どこで・どの周期で数えるかを表します。</div>';
    return;
  }
  items.forEach(item => {
    const itemNeedsOrder = I.needsOrder(item);
    const itemDiv = document.createElement('div');
    itemDiv.className = `item ${itemNeedsOrder ? 'empty' : ''} ${item.complete ? 'complete' : ''} ${String(st.ui.selectedItemId) === String(item.id) ? 'selected' : ''}`;
    itemDiv.dataset.itemId = item.id;
    const lastOrderText = I.formatLastOrder(item.lastOrderedOn);
    const stockText = item.entered ? formatQty(item.count, item.unit) : '未入力';
    itemDiv.innerHTML = `
      <div class="item-info">
        <span class="item-name">
          <span class="item-name-text">${item.name}</span>
          ${itemNeedsOrder ? '<span class="order-badge">発注</span>' : ''}
        </span>
        ${itemFieldsHtml(item)}
        <span class="item-meta">在庫: ${stockText}　必要: ${formatQty(item.target, item.unit)}　補充基準: ${formatQty(item.orderThreshold, item.unit)}</span>
        ${lastOrderText ? `<span class="item-last-order">前回発注: ${lastOrderText}</span>` : ''}
      </div>
    `;
    itemDiv.addEventListener('click', () => selectAndEditItem(item.id));
    listDiv.appendChild(itemDiv);
  });
}

function selectAndEditItem(id) {
  S().ui.selectedItemId = id;
  document.querySelectorAll('#stock-list .item, #item-catalog-list .item').forEach(el => {
    el.classList.toggle('selected', String(el.dataset.itemId) === String(id));
  });
  openEditModal(id);
}

window.selectAndEditItem = selectAndEditItem;
