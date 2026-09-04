
function renderItemsCatalog() {
  const listDiv = document.getElementById('item-catalog-list');
  const filterDiv = document.getElementById('items-filters');
  if (!listDiv || !filterDiv) return;
  filterDiv.innerHTML = '';
  catalogCycleFilter = bindFilterSelect(filterDiv, 'チェック頻度', customCycles, catalogCycleFilter, value => { catalogCycleFilter = value; });
  catalogCategoryFilter = bindFilterSelect(filterDiv, 'カテゴリ', allCategories(), catalogCategoryFilter, value => { catalogCategoryFilter = value; });
  catalogPlaceFilter = bindFilterSelect(filterDiv, '場所', [UNSET_PLACE_FILTER, ...customPlaces], catalogPlaceFilter, value => { catalogPlaceFilter = value; });
  listDiv.innerHTML = '';
  const items = getCatalogItems();
  if (items.length === 0) {
    listDiv.innerHTML = '<div class="empty-message">アイテムがありません。下のボタンから追加してください。チェック頻度と場所は、どこで・どの周期で数えるかを表します。</div>';
    return;
  }
  items.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = itemCardClassName(item);
    itemDiv.dataset.itemId = item.id;
    const lastOrderText = formatLastOrder(item.lastOrderedOn);
    const stockText = item.entered ? formatQty(item.count, item.unit) : '未入力';
    itemDiv.innerHTML = `
      <div class="item-info">
        ${itemNameHtml(item)}
        ${itemFieldsHtml(item)}
        <span class="item-meta">在庫: ${stockText}　必要: ${formatQty(item.target, item.unit)}　補充基準: ${formatQty(item.orderThreshold, item.unit)}</span>
        ${lastOrderText ? `<span class="item-last-order">前回発注: ${lastOrderText}</span>` : ''}
      </div>
    `;
    itemDiv.addEventListener('click', () => selectAndEditItem(item.id));
    listDiv.appendChild(itemDiv);
  });
}
