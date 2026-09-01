function renderProductCatalog() {
  const list = document.getElementById('product-catalog-list');
  if (!list) return;
  list.innerHTML = '';
  if (!catalogProducts.length) {
    list.innerHTML = '<div class="empty-message">商品はまだありません。</div>';
    return;
  }
  catalogProducts.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja')).forEach(product => {
    const row = document.createElement('div');
    row.className = 'item';
    const dests = product.purchaseDests.length
      ? formatPurchaseDestList(product.purchaseDests)
      : '購入先なし';
    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `
      <span class="item-name"><span class="item-name-text">${product.name}</span></span>
      <span class="item-meta">アイテム: ${itemLabel(product.itemId)}</span>
      <span class="item-meta">${dests}</span>
      ${product.barcode ? `<span class="item-meta">バーコード: ${product.barcode}</span>` : ''}
    `;
    appendProductUrlMeta(info, product, { stopPropagation: true });
    row.appendChild(info);
    row.addEventListener('click', () => openProductModal(product.id));
    list.appendChild(row);
  });
}

function renderHistoryList() {
  const list = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = '';
  if (!purchaseHistory.length) {
    list.innerHTML = '<div class="empty-message">履歴はまだありません。</div>';
    return;
  }
  purchaseHistory.forEach(row => {
    const el = document.createElement('div');
    el.className = 'history-row';
    const modeLabel = row.mode === 'receipt' ? '受け取り' : '買い物';
    const product = row.productName ? ` / ${row.productName}` : '';
    const dest = row.dest ? ` · ${row.dest}` : '';
    el.innerHTML = `
      <span class="item-name-text">${row.itemName || '（削除されたアイテム）'}${product}</span>
      <span class="history-row-meta">${formatHistoryWhen(row.at)} · ${modeLabel}${dest} · ${row.qty}</span>
    `;
    list.appendChild(el);
  });
}

function renderLinkedProducts(containerId, itemId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '';
  productsForItem(itemId).forEach(product => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const name = document.createElement('span');
    name.className = 'settings-row-name';
    const dests = productPurchaseDestNames(product);
    name.textContent = dests.length
      ? `${product.name} — ${formatPurchaseDestList(dests)}`
      : `${product.name}（購入先なし）`;
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'settings-edit';
    editBtn.textContent = '編集';
    editBtn.onclick = (e) => { e.preventDefault(); openProductModal(product.id); };
    const unlinkBtn = document.createElement('button');
    unlinkBtn.type = 'button';
    unlinkBtn.className = 'settings-delete';
    unlinkBtn.textContent = '外す';
    unlinkBtn.onclick = (e) => {
      e.preventDefault();
      product.itemId = '';
      saveAndRender();
      renderLinkedProducts(containerId, itemId);
    };
    row.appendChild(name);
    row.appendChild(editBtn);
    row.appendChild(unlinkBtn);
    box.appendChild(row);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'settings-add';
  addBtn.textContent = '＋ 名前だけ追加';
  addBtn.onclick = async (e) => {
    e.preventDefault();
    const item = findItemById(itemId);
    if (!item) return;
    const dests = itemPurchaseDests(item);
    if (!dests.length) {
      alert('先にこのアイテムの購入先を付けて保存してください。');
      return;
    }
    const name = await showPrompt('商品名', item.name || '');
    if (!name || !String(name).trim()) return;
    dests.forEach(dest => ensurePurchaseDest(dest));
    createCatalogProduct({ name: String(name).trim(), itemId: item.id, dests });
    saveAndRender();
    renderLinkedProducts(containerId, itemId);
  };
  const urlBtn = document.createElement('button');
  urlBtn.type = 'button';
  urlBtn.className = 'settings-add';
  urlBtn.textContent = '＋ URLで登録';
  urlBtn.onclick = async (e) => {
    e.preventDefault();
    const item = findItemById(itemId);
    if (!item) return;
    const product = await registerProductFromUrl(item, '');
    if (!product) return;
    saveAndRender();
    renderLinkedProducts(containerId, itemId);
  };
  const detailBtn = document.createElement('button');
  detailBtn.type = 'button';
  detailBtn.className = 'settings-add';
  detailBtn.textContent = '詳しく登録';
  detailBtn.onclick = (e) => { e.preventDefault(); openProductModal(null, itemId); };
  box.appendChild(addBtn);
  box.appendChild(urlBtn);
  box.appendChild(detailBtn);
}

function mountProductForm() {
  const form = document.getElementById('product-form');
  if (!form) return;
  form.innerHTML = `
    <label for="product-item">所属アイテム</label>
    <select id="product-item"></select>
    <p class="settings-hint" id="product-dest-hint">アイテムの購入先を引き継ぎます。必要なら付け足してください。</p>
    <label>購入先</label>
    <div class="check-unit-picker-box">
      <div class="check-unit-picker-toolbar">
        <button type="button" class="picker-add-btn" onclick="addNameFromForm('purchaseDest', 'product-purchase-dests')" aria-label="新しい購入先を追加">＋</button>
      </div>
      <div class="check-unit-picker" id="product-purchase-dests"></div>
    </div>
    <details class="product-extra-fields">
      <summary>URL・バーコード（任意）</summary>
      <label for="product-url">商品ページ URL</label>
      <input type="url" id="product-url" placeholder="https://">
      <label for="product-barcode">バーコード</label>
      <input type="text" id="product-barcode" inputmode="numeric" autocomplete="off">
    </details>
  `;
}

function fillProductItemSelect(selectedId) {
  const select = document.getElementById('product-item');
  if (!select) return;
  select.innerHTML = '';
  appendOption(select, '', '未所属');
  stockItems.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja')).forEach(item => {
    appendOption(select, String(item.id), item.name);
  });
  const value = selectedId ? String(selectedId) : '';
  select.value = [...select.options].some(o => o.value === value) ? value : '';
}

let editingProductId = null;

function fillProductDestsFromItem(itemId, force) {
  const destBox = document.getElementById('product-purchase-dests');
  if (!destBox) return;
  const selected = getSelectedNames('product-purchase-dests');
  if (!force && selected.length) return;
  const item = findItemById(itemId);
  fillPurchaseDestPicker('product', item ? itemPurchaseDests(item) : []);
}

function openProductModal(productId, presetItemId) {
  editingProductId = productId || null;
  const product = findProductById(productId);
  const itemId = product ? product.itemId : (presetItemId || '');
  document.getElementById('product-modal-title').textContent = product ? '商品を編集' : '商品を追加';
  const nameInput = document.getElementById('product-name');
  const item = findItemById(itemId);
  nameInput.value = product ? product.name : (item ? item.name : '');
  nameInput.placeholder = item ? `${item.name}の商品名` : '例：エリエール 5箱';
  mountProductForm();
  fillProductItemSelect(itemId);
  fillPurchaseDestPicker('product', product ? product.purchaseDests : (item ? itemPurchaseDests(item) : []));
  const itemSelect = document.getElementById('product-item');
  if (itemSelect && !product) {
    itemSelect.onchange = () => fillProductDestsFromItem(itemSelect.value, true);
  }
  const urlInput = document.getElementById('product-url');
  const barcodeInput = document.getElementById('product-barcode');
  if (urlInput) urlInput.value = product ? product.url : '';
  if (barcodeInput) barcodeInput.value = product ? product.barcode : '';
  if (product && (product.url || product.barcode)) {
    const extra = document.querySelector('#product-form .product-extra-fields');
    if (extra) extra.open = true;
  }
  document.getElementById('product-modal').style.display = 'flex';
  syncBodyScrollLock();
  if (!product) {
    nameInput.focus();
    nameInput.select();
    nameInput.onkeydown = (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        saveProduct();
      }
    };
  }
}

function closeProductModal() {
  document.getElementById('product-modal').style.display = 'none';
  editingProductId = null;
  syncBodyScrollLock();
}

function saveProduct() {
  const name = document.getElementById('product-name').value.trim();
  if (!name) {
    alert('商品名を入力してください');
    return;
  }
  const dests = normalizePurchaseDests(getSelectedNames('product-purchase-dests'));
  if (!dests.length) {
    alert('購入先を1つ以上選んでください');
    return;
  }
  dests.forEach(dest => ensurePurchaseDest(dest));
  const itemId = document.getElementById('product-item').value;
  let product = findProductById(editingProductId);
  if (!product) {
    product = { id: newItemId() };
    catalogProducts.push(product);
  }
  product.name = name;
  product.itemId = itemId;
  product.purchaseDests = dests;
  product.url = document.getElementById('product-url').value.trim();
  product.barcode = document.getElementById('product-barcode').value.trim();
  closeProductModal();
  saveAndRender();
}
