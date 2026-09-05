const INVENTORY_EMPTY_NO_ITEMS = 'この条件のアイテムはありません。設定のアイテムから追加してください。';
const INVENTORY_EMPTY_NO_SEARCH_TITLE = '一致する商品がありません';
const INVENTORY_EMPTY_NO_SEARCH_HINT = '商品名・商品コードを変えて検索してください。';

function inventoryNoItemsHtml() {
  return `<div class="empty-message">${INVENTORY_EMPTY_NO_ITEMS}</div>`;
}

function inventoryEmptyHtml() {
  if (!hasInventorySearchQuery()) return inventoryNoItemsHtml();
  return `
    <div class="inventory-search-empty" role="status">
      <span class="inventory-search-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <path d="m20 20-3.5-3.5"/>
        </svg>
      </span>
      <p class="inventory-search-empty-title">${INVENTORY_EMPTY_NO_SEARCH_TITLE}</p>
      <p class="inventory-search-empty-hint">${INVENTORY_EMPTY_NO_SEARCH_HINT}</p>
    </div>
  `;
}

function inventoryItemMetaLine(item) {
  const products = productsForItem(item.id);
  const barcode = products.map(p => String(p.barcode || '').trim()).find(Boolean);
  if (barcode) return barcode;
  const category = normalizeCategory(item.category);
  return category || '';
}

function inventoryCheckBadgeHtml(item) {
  const key = itemCheckStatus(item);
  const spec = ITEM_STATUS_BADGES[key];
  const done = key === 'check-done';
  const label = spec ? spec.label : (done ? '完了' : '未入力');
  const chars = done ? ['完', '了'] : ['未', '入', '力'];
  const spans = chars.map(ch => `<span aria-hidden="true">${ch}</span>`).join('');
  return `<span class="inventory-check-badge ${done ? 'done' : 'unentered'}" role="status" aria-label="${label}">${spans}</span>`;
}

function inventoryItemRowInnerHtml(item) {
  const countDisplay = item.entered ? String(item.count) : '';
  const minusDisabled = item.entered && item.count <= 0;
  const meta = inventoryItemMetaLine(item);
  return `
    <div class="inventory-card">
      ${inventoryCheckBadgeHtml(item)}
      <div class="inventory-card-body">
        <div class="inventory-card-title">${item.name}</div>
        ${meta ? `<div class="inventory-card-meta">${meta}</div>` : ''}
      </div>
      <div class="inventory-count">
        <div class="count-stepper">
          <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1減らす" ${minusDisabled ? 'disabled' : ''} onclick="adjustCount(event, this.dataset.itemId, -1)">−</button>
          <input type="text" class="count-input${item.entered ? '' : ' unentered'}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="${item.name}の在庫数" value="${countDisplay}" data-item-id="${item.id}" onfocus="this.select()" oninput="handleCountInput(this)" onchange="updateCountDirect(this.dataset.itemId, this.value)" onkeydown="handleCountKey(event)">
          <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1増やす" onclick="adjustCount(event, this.dataset.itemId, 1)">＋</button>
        </div>
      </div>
    </div>
  `;
}

function placeCardHtml(place, { total, done, percent, status }) {
  return `
    <div class="place-card-head">
      <span class="place-card-name">${place}</span>
      <span class="place-card-badge ${status}">${placeBadgeText(status, done, total)}</span>
    </div>
    <div class="place-card-bar" aria-hidden="true">
      <div class="place-card-bar-track"><div class="place-card-bar-fill ${status}" style="width: ${percent}%"></div></div>
    </div>
  `;
}
