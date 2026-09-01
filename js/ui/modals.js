function overlayIsOpen(el) {
  return el && el.style.display === 'flex';
}

function openOverlays() {
  return ['prompt-modal', 'choice-modal', 'edit-modal', 'add-modal', 'product-modal']
    .map(id => document.getElementById(id))
    .filter(overlayIsOpen);
}

function syncBodyScrollLock() {
  document.body.classList.toggle('modal-open', openOverlays().length > 0);
}

function closeTopOverlay() {
  if (overlayIsOpen(document.getElementById('prompt-modal'))) {
    resolvePrompt(null);
    return;
  }
  if (overlayIsOpen(document.getElementById('choice-modal'))) {
    resolveChoice(null);
    return;
  }
  if (overlayIsOpen(document.getElementById('edit-modal'))) {
    closeEditModal();
    return;
  }
  if (overlayIsOpen(document.getElementById('add-modal'))) {
    closeModal();
    return;
  }
  if (overlayIsOpen(document.getElementById('product-modal'))) {
    closeProductModal();
  }
}

function overlayFocusables(overlay) {
  return Array.from(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function syncVisualViewportVars() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) {
    root.style.setProperty('--vv-top', '0px');
    root.style.setProperty('--vv-height', window.innerHeight + 'px');
    return;
  }
  root.style.setProperty('--vv-top', Math.max(0, vv.offsetTop) + 'px');
  root.style.setProperty('--vv-height', Math.max(0, vv.height) + 'px');
}

function isCoarsePointer() {
  return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function revealItemFormStart(overlayId, nameInputId, options = {}) {
  syncVisualViewportVars();
  const overlay = document.getElementById(overlayId);
  const input = document.getElementById(nameInputId);
  const body = overlay && overlay.querySelector('.modal-body');
  if (overlay) overlay.scrollTop = 0;
  if (body) body.scrollTop = 0;
  requestAnimationFrame(() => {
    syncVisualViewportVars();
    if (overlay) overlay.scrollTop = 0;
    if (body) body.scrollTop = 0;
    if (!input || isCoarsePointer()) return;
    input.focus({ preventScroll: true });
    if (options.select) input.select();
  });
}

syncVisualViewportVars();
window.addEventListener('resize', syncVisualViewportVars);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncVisualViewportVars);
  window.visualViewport.addEventListener('scroll', syncVisualViewportVars);
}

// 入力モーダルを表示して入力値を返す（prompt() の代替。IMEでの日本語入力が可能）
let promptResolver = null;

function showPrompt(title, defaultValue = '', type = 'text') {
  const input = document.getElementById('prompt-input');
  document.getElementById('prompt-title').textContent = title;
  input.type = type;
  input.value = defaultValue;
  document.getElementById('prompt-modal').style.display = 'flex';
  syncBodyScrollLock();
  input.focus();
  input.select();
  return new Promise(resolve => { promptResolver = resolve; });
}

function resolvePrompt(value) {
  document.getElementById('prompt-modal').style.display = 'none';
  syncBodyScrollLock();
  const resolve = promptResolver;
  promptResolver = null;
  if (resolve) resolve(value);
}

async function resolveOnlineDestForProductUrl(item, url, destHint) {
  const hinted = normalizePurchaseDest(destHint);
  if (hinted && destKind(hinted) === 'online') return hinted;

  const inferred = inferPurchaseDestFromUrl(url);
  if (inferred) {
    ensurePurchaseDest(inferred, 'online');
    return inferred;
  }

  const itemOnline = itemPurchaseDests(item).filter(name => destKind(name) === 'online');
  if (itemOnline.length === 1) return itemOnline[0];

  const allOnline = onlinePurchaseDests();
  if (allOnline.length === 1) return allOnline[0];

  const defaultName = inferred || itemOnline[0] || allOnline[0] || 'LOHACO';
  const name = await showPrompt('ネットショップ（購入先）', defaultName);
  if (!name || !String(name).trim()) return '';
  return ensurePurchaseDest(String(name).trim(), 'online');
}

async function registerProductFromUrl(item, destHint) {
  const url = await showPrompt('商品ページ URL', '', 'url');
  if (!url || !String(url).trim()) return null;
  const trimmedUrl = String(url).trim();
  if (!isHttpProductUrl(trimmedUrl)) {
    alert('http または https の商品ページ URL を入力してください。');
    return null;
  }
  const dest = await resolveOnlineDestForProductUrl(item, trimmedUrl, destHint);
  if (!dest) return null;
  const name = await showPrompt('商品名', item.name || '');
  if (!name || !String(name).trim()) return null;
  ensurePurchaseDest(dest, 'online');
  const product = createCatalogProduct({
    name: String(name).trim(),
    itemId: item.id,
    dests: [dest],
    url: normalizeProductPageUrl(trimmedUrl)
  });
  return product;
}

let choiceResolver = null;

function renderChoiceActions(actions) {
  const container = document.getElementById('choice-actions');
  if (!container) return;
  container.innerHTML = '';
  actions.forEach(action => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    if (action.kind === 'cancel') btn.className = 'btn-cancel';
    else if (action.kind === 'delete') btn.className = 'btn-delete';
    else btn.className = 'btn-save';
    btn.onclick = () => resolveChoice(action.value);
    container.appendChild(btn);
  });
}

function showActionChoice(title, hint, actions) {
  document.getElementById('choice-title').textContent = title;
  const hintEl = document.getElementById('choice-hint');
  if (hintEl) {
    hintEl.textContent = hint || '';
    hintEl.hidden = !hint;
  }
  renderChoiceActions([
    ...actions.map(action => ({
      label: action.label,
      value: action.value,
      kind: action.danger ? 'delete' : 'primary'
    })),
    { label: 'キャンセル', value: null, kind: 'cancel' }
  ]);
  document.getElementById('choice-modal').style.display = 'flex';
  syncBodyScrollLock();
  return new Promise(resolve => { choiceResolver = resolve; });
}

function showChoice(title, hint) {
  return showActionChoice(title, hint, [
    { label: 'ネットショップ', value: 'online' },
    { label: '店舗', value: 'store' }
  ]);
}

function resolveChoice(value) {
  document.getElementById('choice-modal').style.display = 'none';
  syncBodyScrollLock();
  const resolve = choiceResolver;
  choiceResolver = null;
  if (resolve) resolve(value);
}

function pickPurchaseDestKind() {
  return showChoice(
    '購入先の種別',
    'ネットショップは「注文済み」のあと受け取り待ちへ、店舗は買い物リストへ入ります。'
  );
}

async function changePurchaseDestKind(name) {
  const chosen = await pickPurchaseDestKind();
  if (!chosen) return;
  setPurchaseDestKind(name, chosen);
  await persistAndFlushCloud();
}


// Enter で確定、Escape でキャンセル
document.getElementById('prompt-input').addEventListener('keydown', (e) => {
  // IME変換中の Enter は確定操作なので無視する
  if (e.isComposing) return;
  if (e.key === 'Enter') resolvePrompt(e.target.value);
  if (e.key === 'Escape') resolvePrompt(null);
});

document.addEventListener('keydown', (e) => {
  const promptEl = document.getElementById('prompt-modal');
  const overlay = overlayIsOpen(promptEl)
    ? promptEl
    : openOverlays().slice(-1)[0];
  if (!overlay) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeTopOverlay();
    return;
  }
  if (e.key !== 'Tab') return;
  const nodes = overlayFocusables(overlay);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// モーダルを開く

function openModal() {
  document.getElementById('add-modal').style.display = 'flex';
  const preset = [];
  if (currentPage === 'settings') {
    if (catalogCycleFilter !== ALL_FILTER && catalogPlaceFilter !== ALL_FILTER) {
      preset.push({ cycle: catalogCycleFilter, place: catalogPlaceFilter });
    }
  } else if (inventoryCycleFilter !== ALL_FILTER && inventoryPlaceFilter !== ALL_FILTER) {
    preset.push({ cycle: inventoryCycleFilter, place: inventoryPlaceFilter });
  }
  fillCyclePlacePickers('new-item', preset.length ? preset : (customCheckUnits[0] ? [customCheckUnits[0]] : []));
  fillCategorySelect(document.getElementById('new-item-category'), '');
  fillPurchaseDestPicker('new-item', []);
  fillUnitSelect(document.getElementById('new-item-unit'), '個');
  document.getElementById('new-item-target').value = 1;
  document.getElementById('new-item-threshold').value = 0;
  syncBodyScrollLock();
  revealItemFormStart('add-modal', 'new-item-name');
}


// モーダルを閉じる

function closeModal() {
  document.getElementById('add-modal').style.display = 'none';
  document.getElementById('new-item-name').value = '';
  document.getElementById('new-item-target').value = 1;
  document.getElementById('new-item-threshold').value = 0;
  syncBodyScrollLock();
}
