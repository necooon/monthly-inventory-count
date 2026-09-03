function pendingProductName(item) {
  const product = findProductById(item.pendingProductId);
  return product && product.name ? product.name : '';
}

function orderPlaceInfoHtml(item, options) {
  const lastOrder = formatLastOrder(item.lastOrderedOn) || 'なし';
  const qty = formatQty(itemOrderQty(item), item.unit);
  const stock = formatQty(item.count, item.unit);
  const target = formatQty(item.target, item.unit);
  if (options && options.receiptLayout) {
    const productName = pendingProductName(item);
    const productLine = productName
      ? `<div class="order-fulfill-product-name">${productName}</div>`
      : '';
    return `
      <div class="order-place-head">
        <span class="item-name"><span class="item-name-text">${item.name}</span></span>
      </div>
      ${productLine}
    `;
  }
  if (options && (options.selectLayout || options.shoppingLayout)) {
    const qtyLabel = options.shoppingLayout ? '購入数' : '注文';
    const stockLabel = options.shoppingLayout ? '棚卸結果' : '在庫';
    const stockValue = options.shoppingLayout ? stock : `${stock}/${target}`;
    return `
      <div class="order-place-head">
        <span class="item-name"><span class="item-name-text">${item.name}</span></span>
      </div>
      <div class="order-place-qty-line">
        <span class="order-place-qty-part"><span class="order-place-meta-label">${qtyLabel}</span>${qty}</span>
        <span class="order-place-qty-sep">|</span>
        <span class="order-place-qty-part"><span class="order-place-meta-label">${stockLabel}</span>${stockValue}</span>
      </div>
    `;
  }
  return `
      <div class="order-place-head">
        <span class="item-name"><span class="item-name-text">${item.name}</span></span>
        <span class="order-place-qty">買う ${qty}</span>
      </div>
      <div class="order-place-meta">
        <span class="order-place-meta-item"><span class="order-place-meta-label">在庫</span>${stock} / ${target}</span>
        <span class="order-place-meta-item"><span class="order-place-meta-label">前回</span>${lastOrder}</span>
      </div>
  `;
}

function isSelectItemExpanded(id) {
  return !selectCollapsedItemIds.has(String(id));
}

function toggleSelectItemExpanded(id, itemDiv, details, trigger) {
  const key = String(id);
  if (selectCollapsedItemIds.has(key)) selectCollapsedItemIds.delete(key);
  else selectCollapsedItemIds.add(key);
  const open = !selectCollapsedItemIds.has(key);
  itemDiv.classList.toggle('expanded', open);
  details.hidden = !open;
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

let lohacoSelectedProductByItem = new Map();

function getLohacoSelectedProductId(item) {
  const key = String(item.id);
  if (lohacoSelectedProductByItem.has(key)) {
    return lohacoSelectedProductByItem.get(key) || '';
  }
  return lohacoProductIdForItem(item);
}

function setLohacoSelectedProductId(itemId, productId) {
  lohacoSelectedProductByItem.set(String(itemId), productId ? String(productId) : '');
}

function clearLohacoSelectedProductIds(itemIds) {
  (itemIds || []).forEach(id => lohacoSelectedProductByItem.delete(String(id)));
}

function appendLohacoProductPicker(parent, item) {
  const wrap = document.createElement('div');
  wrap.className = 'order-select-products';
  const heading = document.createElement('div');
  heading.className = 'order-field-label';
  heading.textContent = 'LOHACO商品';
  wrap.appendChild(heading);

  const products = lohacoProductsForItem(item);
  const selectedId = getLohacoSelectedProductId(item);

  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'settings-hint';
    empty.textContent = 'LOHACO商品が未登録です。URLで登録してください。';
    wrap.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'order-lohaco-product-picker';
    products.forEach(product => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'order-lohaco-product-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `lohaco-product-${item.id}`;
      radio.value = product.id;
      radio.checked = String(product.id) === String(selectedId);
      radio.onclick = event => event.stopPropagation();
      radio.onchange = () => {
        setLohacoSelectedProductId(item.id, product.id);
        const check = parent.closest('.order-lohaco-item')?.querySelector('.order-lohaco-check');
        if (check) check.checked = true;
        syncLohacoSelectButtons();
      };
      const name = document.createElement('span');
      name.className = 'order-lohaco-product-name';
      appendProductName(name, product);
      const link = name.querySelector('.product-page-link');
      if (link) {
        link.addEventListener('click', () => {
          if (!radio.checked) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
      label.appendChild(radio);
      label.appendChild(name);
      li.appendChild(label);
      list.appendChild(li);
    });
    wrap.appendChild(list);
  }

  mountItemProductAddActions(wrap, item, {
    urlOnly: true,
    destHint: LOHACO_DEST_NAME,
    stopPropagation: true,
    buttonClass: 'order-select-add-btn',
    actionsClass: 'order-select-add-actions',
    onRegistered: product => {
      setLohacoSelectedProductId(item.id, product.id);
      showUndoToast(`「${product.name}」を登録しました`);
      saveAndRender();
    }
  });

  parent.appendChild(wrap);
}

function appendLohacoSelectRow(parent, item, dest) {
  const itemDiv = document.createElement('div');
  const expanded = isSelectItemExpanded(item.id);
  itemDiv.className = `item order-place-item order-lohaco-item${expanded ? ' expanded' : ''}`;
  itemDiv.dataset.itemId = item.id;

  const row = document.createElement('div');
  row.className = 'order-lohaco-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'order-lohaco-check';
  input.dataset.itemId = item.id;
  input.dataset.dest = dest || '';
  input.setAttribute('aria-label', `${item.name}を選ぶ`);
  input.checked = false;
  input.onclick = event => event.stopPropagation();
  input.onchange = syncLohacoSelectButtons;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'order-lohaco-main';
  trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  trigger.setAttribute('aria-label', `${item.name}の商品を表示`);
  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = orderPlaceInfoHtml(item, { selectLayout: true });
  trigger.appendChild(info);

  const details = document.createElement('div');
  details.className = 'order-select-details';
  details.hidden = !expanded;
  appendLohacoProductPicker(details, item);
  trigger.onclick = () => toggleSelectItemExpanded(item.id, itemDiv, details, trigger);

  row.appendChild(input);
  row.appendChild(trigger);
  itemDiv.appendChild(row);
  itemDiv.appendChild(details);
  parent.appendChild(itemDiv);
}
