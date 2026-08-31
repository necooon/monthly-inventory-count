function orderPlaceInfoHtml(item) {
  const lastOrder = formatLastOrder(item.lastOrderedOn);
  return `
      <div class="order-place-head">
        <span class="item-name"><span class="item-name-text">${item.name}</span></span>
        <span class="order-place-qty">買う ${formatQty(itemOrderQty(item), item.unit)}</span>
      </div>
      <div class="order-place-meta">
        <span class="order-place-meta-item"><span class="order-place-meta-label">在庫</span>${formatQty(item.count, item.unit)} / ${formatQty(item.target, item.unit)}</span>
        <span class="order-place-meta-item"><span class="order-place-meta-label">前回</span>${lastOrder || 'なし'}</span>
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
  appendSelectOption(select, ADD_NEW_VALUE, '＋ この場で登録（名前だけ）');
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
  if (productSelect.value === ADD_NEW_VALUE) {
    const created = await quickRegisterProductFromOrder(item, destSelect.value);
    const done = await finishOrderProductRegistration(item, productSelect, created);
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
  controls.appendChild(onlineActions);
  controls.appendChild(btn);

  const form = document.createElement('div');
  form.className = 'order-place-form';
  form.appendChild(controls);
  itemDiv.appendChild(info);
  itemDiv.appendChild(form);
  parent.appendChild(itemDiv);
}

function appendLohacoSelectRow(parent, item) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item order-place-item order-lohaco-item';
  const label = document.createElement('label');
  label.className = 'order-lohaco-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'order-lohaco-check';
  input.dataset.itemId = item.id;
  input.setAttribute('aria-label', `${item.name}をLOHACOで買う`);
  input.onchange = syncLohacoConfirmButton;
  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = orderPlaceInfoHtml(item);
  label.appendChild(input);
  label.appendChild(info);
  itemDiv.appendChild(label);
  parent.appendChild(itemDiv);
}
