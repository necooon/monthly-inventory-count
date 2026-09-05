function itemFieldsHtml(item, options) {
  const cycles = [...new Set(itemCheckUnits(item).map(u => u.cycle))];
  const places = [...new Set(itemCheckUnits(item).map(u => placeLabel(u.place)))];
  const category = normalizeCategory(item.category) || UNSET_CATEGORY_LABEL;
  const chips = values => values.map(v => `<span class="item-location">${v}</span>`).join('');
  const hidePlace = options && options.hidePlace;
  const hideCycle = options && options.hideCycle;
  const hideCategory = options && options.hideCategory;
  const rows = [];
  if (!hideCycle) {
    rows.push(`<div class="item-field"><span class="item-field-label">チェック頻度</span><span class="item-location-wrap">${chips(cycles)}</span></div>`);
  }
  if (!hideCategory) {
    rows.push(`<div class="item-field"><span class="item-field-label">カテゴリ</span><span class="item-location-wrap">${chips([category])}</span></div>`);
  }
  if (!(options && options.hidePurchaseDest)) {
    const dests = itemPurchaseDests(item);
    rows.push(`<div class="item-field"><span class="item-field-label">購入先</span><span class="item-location-wrap">${chips(dests.length ? dests : [UNSET_PURCHASE_DEST_LABEL])}</span></div>`);
  }
  if (!hidePlace) {
    rows.push(`<div class="item-field"><span class="item-field-label">場所</span><span class="item-location-wrap">${chips(places.length ? places : [UNSET_PLACE_FILTER])}</span></div>`);
  }
  if (!rows.length) return '';
  return `<div class="item-fields">${rows.join('')}</div>`;
}

const ITEM_STATUS_BADGES = {
  shopping: { className: 'order-badge pending-shopping', label: '買い物中' },
  receipt: { className: 'order-badge pending-receipt', label: '受け取り待ち' },
  'stock-empty': { className: 'order-badge stock-empty', label: '在庫切れ' },
  'stock-ok': { className: 'order-badge stock-ok', label: '在庫OK' }
};

function itemCardClassName(item, extraClass) {
  const status = itemCardStatus(item);
  const stockClass = status === 'stock-empty' || status === 'stock-ok' ? status : '';
  const selected = String(selectedItemId) === String(item.id) ? 'selected' : '';
  return ['item', extraClass, stockClass, selected].filter(Boolean).join(' ');
}

function itemStatusBadgeHtml(item) {
  const spec = ITEM_STATUS_BADGES[itemCardStatus(item)];
  return spec ? `<span class="${spec.className}">${spec.label}</span>` : '';
}

function itemNameHtml(item) {
  return `<span class="item-name"><span class="item-name-text">${item.name}</span>${itemStatusBadgeHtml(item)}</span>`;
}

function formatQty(n, unit) {
  return `${n}${unit || '個'}`;
}
