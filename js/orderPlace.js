function orderPlaceInfoHtml(item, options) {
  const lastOrder = formatLastOrder(item.lastOrderedOn) || 'なし';
  const qty = formatQty(itemOrderQty(item), item.unit);
  const stock = formatQty(item.count, item.unit);
  const target = formatQty(item.target, item.unit);
  if (options && options.selectLayout) {
    return `
      <div class="order-place-head">
        <span class="item-name"><span class="item-name-text">${item.name}</span></span>
      </div>
      <div class="order-place-qty-line">
        <span class="order-place-qty-part"><span class="order-place-meta-label">注文</span>${qty}</span>
        <span class="order-place-qty-sep">|</span>
        <span class="order-place-qty-part"><span class="order-place-meta-label">在庫</span>${stock}/${target}</span>
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

function createOrderSelectField(labelText, selectClass, itemId, fieldKey) {
  const field = document.createElement('div');
  field.className = 'order-field';
  const label = document.createElement('label');
  label.className = 'order-field-label';
  label.textContent = labelText;
  const select = document.createElement('select');
  select.className = selectClass;
  select.id = `order-${fieldKey}-${itemId}`;
  label.htmlFor = select.id;
  field.appendChild(label);
  field.appendChild(select);
  return { field, label, select };
}

function appendSelectOption(select, value, text) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  select.appendChild(opt);
  return opt;
}

function fillProductSelectOptions(select, products) {
  select.innerHTML = '';
  appendSelectOption(
    select,
    '',
    products.length ? '選ばない（購入先を入力）' : '未登録（購入先を入力）'
  );
  products.forEach(product => {
    appendSelectOption(select, product.id, productOptionLabel(product));
  });
  appendSelectOption(select, ADD_PRODUCT_URL_VALUE, '＋ 商品ページ URLで登録');
}

function placementDestCandidates(item, product) {
  if (product) return productPurchaseDestNames(product);
  if (itemPurchaseDests(item).length) return itemPurchaseDests(item);
  return allPurchaseDests();
}

function fillDestSelectOptions(select, names, { product }) {
  select.innerHTML = '';
  appendSelectOption(
    select,
    '',
    product ? '商品の購入先を選ぶ' : '購入先を選ぶ'
  );
  names.forEach(name => {
    appendSelectOption(select, name, `${name}（${destKindLabel(name)}）`);
  });
  if (!product) {
    appendSelectOption(select, ADD_NEW_VALUE, '＋ 新しい購入先を入力');
  }
}

function pickDestSelectValue(names, prev, product) {
  if (names.includes(prev)) return prev;
  if (names.length === 1) return names[0];
  return '';
}

function syncPlaceOrderAccessLinks(onlineActions, item, productSelect, destSelect) {
  renderOnlineProductAccessLinks(onlineActions, {
    item,
    product: findProductById(productSelect.value),
    dest: orderPlacementDestValue(destSelect)
  });
}

async function handlePlaceOrderProductSelectChange(item, productSelect, destSelect, syncFields) {
  if (productSelect.value === ADD_PRODUCT_URL_VALUE) {
    const created = await registerProductFromUrl(item, destSelect.value);
    const done = await finishOrderProductRegistration(
      item,
      productSelect,
      created,
      created ? `「${created.name}」を登録しました。確定で発注できます` : ''
    );
    if (!done) syncFields();
    return;
  }
  syncFields();
}

async function handlePlaceOrderDestSelectChange(item, destSelect, btn, productSelect, onlineActions, syncFields) {
  if (destSelect.value !== ADD_NEW_VALUE) {
    syncOrderPlacementButton(btn, destSelect);
    syncPlaceOrderAccessLinks(onlineActions, item, productSelect, destSelect);
    return;
  }
  const name = await showPrompt('新しい購入先');
  if (!name || !String(name).trim()) {
    destSelect.value = '';
    syncOrderPlacementButton(btn, destSelect);
    return;
  }
  const kind = await pickPurchaseDestKind();
  if (!kind) {
    destSelect.value = '';
    syncOrderPlacementButton(btn, destSelect);
    return;
  }
  const dest = ensurePurchaseDest(String(name).trim(), kind);
  persistMasters();
  syncFields();
  destSelect.value = dest;
}

function restorePendingProductSelection(item, productSelect, syncFields) {
  if (!pendingProductSelect || String(pendingProductSelect.itemId) !== String(item.id)) return;
  const keepId = pendingProductSelect.productId;
  pendingProductSelect = null;
  if ([...productSelect.options].some(o => o.value === keepId)) {
    productSelect.value = keepId;
    syncFields();
  }
}

function appendPlaceOrderRow(parent, item) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item order-place-item';
  itemDiv.dataset.orderItem = item.id;

  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = orderPlaceInfoHtml(item);

  const products = productsForItem(item.id);
  const { field: productField, select: productSelect } = createOrderSelectField('商品', 'order-product-select', item.id, 'product');
  fillProductSelectOptions(productSelect, products);

  const { field: destField, select: destSelect } = createOrderSelectField('購入先', 'order-dest-select', item.id, 'dest');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'order-action-btn';
  btn.disabled = true;
  btn.textContent = '確定';
  btn.onclick = () => confirmOrderPlacement(item.id, productSelect.value, destSelect.value);

  const onlineActions = document.createElement('div');
  onlineActions.className = 'order-online-actions';

  const syncOrderDestFields = () => {
    const product = findProductById(productSelect.value);
    const names = placementDestCandidates(item, product);
    const prev = destSelect.value;
    fillDestSelectOptions(destSelect, names, { product });
    destSelect.value = pickDestSelectValue(names, prev, product);
    syncOrderPlacementButton(btn, destSelect);
    syncPlaceOrderAccessLinks(onlineActions, item, productSelect, destSelect);
  };

  productSelect.onchange = () => handlePlaceOrderProductSelectChange(item, productSelect, destSelect, syncOrderDestFields);
  destSelect.onchange = () => handlePlaceOrderDestSelectChange(item, destSelect, btn, productSelect, onlineActions, syncOrderDestFields);

  syncOrderDestFields();
  restorePendingProductSelection(item, productSelect, syncOrderDestFields);

  const controls = document.createElement('div');
  controls.className = 'order-place-fields';
  controls.appendChild(productField);
  controls.appendChild(destField);
  mountItemProductAddActions(controls, item, {
    urlOnly: true,
    getDestHint: () => orderPlacementDestValue(destSelect),
    stopPropagation: true,
    buttonClass: 'order-select-add-btn',
    actionsClass: 'order-select-add-actions',
    onRegistered: product => {
      finishOrderProductRegistration(
        item,
        productSelect,
        product,
        `「${product.name}」を登録しました。確定で発注できます`
      );
    }
  });
  controls.appendChild(onlineActions);
  controls.appendChild(btn);

  const form = document.createElement('div');
  form.className = 'order-place-form';
  form.appendChild(controls);
  itemDiv.appendChild(info);
  itemDiv.appendChild(form);
  parent.appendChild(itemDiv);
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
    empty.textContent = 'LOHACO商品が未登録です。URLで登録するか、LOHACOで検索してください。';
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

  const selectedProduct = selectedId ? findProductById(selectedId) : null;
  const cartActions = mountOnlineAccessActions(item, selectedProduct, LOHACO_DEST_NAME, {
    className: 'order-online-actions order-lohaco-search-bar',
    includeCartAdd: false,
    preferSearch: true
  });
  if (cartActions) wrap.appendChild(cartActions);

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
  trigger.setAttribute('aria-label', `${item.name}の商品と検索を表示`);
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
