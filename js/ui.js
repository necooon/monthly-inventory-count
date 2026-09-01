function bindSettingsSectionOpen(details, key) {
  details.dataset.settingsSection = key;
  const shouldOpen = settingsOpenSections.has(key);
  if (details.dataset.settingsToggleBound !== '1') {
    details.dataset.settingsToggleBound = '1';
    details.addEventListener('toggle', () => {
      if (details.open) settingsOpenSections.add(key);
      else settingsOpenSections.delete(key);
      persistSettingsOpenSections();
    });
  }
  if (details.open !== shouldOpen) details.open = shouldOpen;
}

function appendSettingsSection(root, title, kind, names, options = {}) {
  const locked = options.locked || new Set();
  const section = document.createElement('details');
  section.className = 'settings-section';
  const heading = document.createElement('summary');
  heading.textContent = title;
  section.appendChild(heading);
  bindSettingsSectionOpen(section, kind);
  if (options.hint) {
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = options.hint;
    section.appendChild(hint);
  }
  names.forEach(name => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const label = document.createElement('span');
    label.className = 'settings-row-name';
    label.textContent = name;
    if (typeof options.nameExtra === 'function') {
      const extra = options.nameExtra(name);
      if (extra) {
        const chip = document.createElement('span');
        chip.className = 'settings-row-extra';
        chip.textContent = extra;
        label.appendChild(chip);
      }
    }
    const isLocked = locked.has(name);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'settings-edit';
    editBtn.textContent = '変更';
    editBtn.disabled = isLocked;
    editBtn.onclick = () => renameMasterName(kind, name);
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'settings-delete';
    deleteBtn.textContent = '削除';
    deleteBtn.disabled = isLocked;
    deleteBtn.onclick = () => deleteMasterName(kind, name);
    row.appendChild(label);
    if (typeof options.extraAction === 'function') options.extraAction(name, row);
    if (options.reorder) {
      const index = names.indexOf(name);
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'settings-move';
      upBtn.textContent = '↑';
      upBtn.setAttribute('aria-label', name + 'を上へ');
      upBtn.disabled = isLocked || index <= 0;
      upBtn.onclick = () => moveMasterName(kind, name, -1);
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'settings-move';
      downBtn.textContent = '↓';
      downBtn.setAttribute('aria-label', name + 'を下へ');
      downBtn.disabled = isLocked || index >= names.length - 1;
      downBtn.onclick = () => moveMasterName(kind, name, 1);
      row.appendChild(upBtn);
      row.appendChild(downBtn);
    }
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);
    section.appendChild(row);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'settings-add';
  addBtn.textContent = '＋ 追加';
  addBtn.onclick = () => addMasterName(kind);
  section.appendChild(addBtn);
  root.appendChild(section);
}

function renderSettings() {
  const itemsSection = document.querySelector('#page-settings [data-settings-section="items"]');
  if (itemsSection) bindSettingsSectionOpen(itemsSection, 'items');
  const productsSection = document.querySelector('#page-settings [data-settings-section="products"]');
  if (productsSection) bindSettingsSectionOpen(productsSection, 'products');
  const historySection = document.querySelector('#page-settings [data-settings-section="history"]');
  if (historySection) bindSettingsSectionOpen(historySection, 'history');
  renderProductCatalog();
  renderHistoryList();
  const root = document.getElementById('settings-list');
  if (!root) return;
  root.innerHTML = '';
  appendSettingsSection(root, 'チェック頻度', 'cycle', customCycles.slice(), {
    hint: '月次・週次など、いつ数えるかの区分です。'
  });
  appendSettingsSection(root, '場所', 'place', customPlaces.slice(), {
    hint: '棚卸しのときに回る場所です。↑↓で並び順を変えられます。',
    reorder: true
  });
  appendSettingsSection(root, 'カテゴリ', 'category', allCategories(), {
    hint: '買い物リストのまとめに使います。↑↓で並び順を変えられます。',
    reorder: true
  });
  appendSettingsSection(root, '購入先', 'purchaseDest', allPurchaseDests(), {
    hint: '発注リストのまとめに使います。1つの品を複数の店で買えます。ネット／店舗で発注後の流れが変わります。↑↓で並び順を変えられます。',
    reorder: true,
    nameExtra: name => destKindLabel(name),
    extraAction: (name, row) => {
      const kindBtn = document.createElement('button');
      kindBtn.type = 'button';
      kindBtn.className = 'settings-edit';
      kindBtn.textContent = '種別';
      kindBtn.setAttribute('aria-label', name + 'の種別を変更');
      kindBtn.onclick = () => changePurchaseDestKind(name);
      row.appendChild(kindBtn);
    }
  });
  const danger = document.createElement('div');
  danger.className = 'settings-section';
  const heading = document.createElement('h3');
  heading.textContent = '棚卸しデータ';
  const hint = document.createElement('p');
  hint.className = 'settings-hint';
  hint.textContent = 'アイテム名や場所はそのまま残し、すべての数量入力だけを未入力に戻します。';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'reset-btn';
  resetBtn.style.width = '100%';
  resetBtn.textContent = 'すべての数量をリセット';
  resetBtn.onclick = () => resetAllInventory();
  danger.appendChild(heading);
  danger.appendChild(hint);
  danger.appendChild(resetBtn);
  root.appendChild(danger);
}

function showPage(page) {
  if (page === 'items') page = 'settings';
  currentPage = page;
  localStorage.setItem(StorageKeys.CURRENT_PAGE, page);
  PAGE_IDS.forEach(p => {
    const pageEl = document.getElementById(`page-${p}`);
    if (pageEl) pageEl.classList.toggle('active', p === page);
    const nav = document.getElementById(`nav-${p}`);
    if (!nav) return;
    const on = p === page;
    nav.classList.toggle('active', on);
    if (on) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  });
  saveAndRender();
}

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

function showChoice(title, hint) {
  document.getElementById('choice-title').textContent = title;
  const hintEl = document.getElementById('choice-hint');
  if (hintEl) hintEl.textContent = hint || '';
  document.getElementById('choice-modal').style.display = 'flex';
  syncBodyScrollLock();
  return new Promise(resolve => { choiceResolver = resolve; });
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

async function addNameFromForm(kind, containerId) {
  const spec = MASTER_KINDS[kind];
  const selected = getSelectedNames(containerId);
  const raw = await showPrompt(spec.addTitle);
  if (!raw || !raw.trim()) return;
  const trimmed = raw.trim();
  if (kind === 'place' && trimmed === REMOVED_LOCATION) {
    alert('「その他」は使えません。具体的な名前を入力してください。');
    return;
  }
  spec.ensure(trimmed);
  if (kind === 'purchaseDest') {
    const chosen = await pickPurchaseDestKind();
    setPurchaseDestKind(trimmed, chosen || 'store');
  }
  persistMasters();
  if (!selected.includes(trimmed)) selected.push(trimmed);
  fillNamePicker(containerId, spec.uniqueNames(), selected);
}

function fillNamePicker(containerId, names, selectedNames) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const selected = new Set(selectedNames || []);
  box.innerHTML = '';
  names.forEach(name => {
    const label = document.createElement('label');
    label.className = 'check-unit-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = name;
    input.checked = selected.has(name);
    const span = document.createElement('span');
    span.textContent = name;
    label.appendChild(input);
    label.appendChild(span);
    box.appendChild(label);
  });
}

function getSelectedNames(containerId) {
  return Array.from(document.querySelectorAll('#' + containerId + ' input[type="checkbox"]:checked'))
    .map(el => el.value.trim())
    .filter(Boolean);
}

function fillCyclePlacePickers(prefix, selectedUnits) {
  const units = selectedUnits || [];
  fillNamePicker(prefix + '-cycles', customCycles, [...new Set(units.map(u => u.cycle).filter(Boolean))]);
  const places = [...new Set(units.map(u => u.place).filter(Boolean))];
  fillPlaceSelect(document.getElementById(prefix + '-places'), places[0] || '');
}

function selectedPlacesFromPrefix(prefix) {
  const select = document.getElementById(prefix + '-places');
  if (!select) return [];
  const value = String(select.value || '').trim();
  if (!value || value === ADD_NEW_VALUE) return [];
  return [value];
}

function unitsFromCyclePlacePickers(prefix) {
  const cycles = getSelectedNames(prefix + '-cycles');
  const places = selectedPlacesFromPrefix(prefix);
  const units = [];
  if (cycles.length && !places.length) {
    cycles.forEach(cycle => {
      const unit = ensureCheckUnit(cycle, '');
      if (unit) units.push(unit);
    });
  } else {
    cycles.forEach(cycle => {
      places.forEach(place => {
        const unit = ensureCheckUnit(cycle, place);
        if (unit) units.push(unit);
      });
    });
  }
  return { cycles, places, units };
}

function refreshCyclePlacePickers(extraSelected) {
  ['new-item', 'edit-item'].forEach(prefix => {
    const selected = unitsFromCyclePlacePickers(prefix).units;
    if (extraSelected && !selected.some(u => unitsEqual(u, extraSelected))) selected.push(extraSelected);
    fillCyclePlacePickers(prefix, selected);
  });
}

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

function isUnitActionValue(value) {
  return value === ADD_NEW_VALUE || value === RENAME_VALUE || value === DELETE_VALUE;
}

function appendOption(select, value, text, options = {}) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  if (options.bold) option.style.fontWeight = 'bold';
  select.appendChild(option);
  return option;
}

function otherFormSelect(select, suffix) {
  const otherPrefix = select.id.startsWith('edit-item') ? 'new-item' : 'edit-item';
  return document.getElementById(otherPrefix + '-' + suffix);
}

async function addNewUnit() {
  const raw = await showPrompt('新しい単位を入力してください（例：束）');
  if (!raw || raw.trim() === '') return null;
  const trimmed = raw.trim();
  ensureUnit(trimmed);
  persistMasters();
  scheduleCloudSave();
  return trimmed;
}

async function handleUnitSelectChange(select) {
  const previous = select.dataset.currentUnit || '';
  if (select.value === ADD_NEW_VALUE) {
    const added = await addNewUnit();
    fillUnitSelect(select, added || previous || defaultUnitName());
    const other = otherFormSelect(select, 'unit');
    if (other) fillUnitSelect(other, other.dataset.currentUnit || defaultUnitName());
  } else if (select.value === RENAME_VALUE) {
    fillUnitSelect(select, previous);
    if (previous) {
      const next = await renameMasterName('unit', previous);
      const chosen = next || previous;
      fillUnitSelect(select, chosen);
      const other = otherFormSelect(select, 'unit');
      if (other) {
        const otherVal = other.dataset.currentUnit === previous ? chosen : other.dataset.currentUnit;
        fillUnitSelect(other, otherVal || defaultUnitName());
      }
    }
  } else if (select.value === DELETE_VALUE) {
    fillUnitSelect(select, previous);
    if (previous) {
      await deleteMasterName('unit', previous);
      const names = allUnits();
      const chosen = names.includes(previous) ? previous : (names[0] || defaultUnitName());
      fillUnitSelect(select, chosen);
      const other = otherFormSelect(select, 'unit');
      if (other) {
        const otherVal = other.dataset.currentUnit;
        fillUnitSelect(other, names.includes(otherVal) ? otherVal : (names[0] || defaultUnitName()));
      }
    }
  } else {
    select.dataset.currentUnit = select.value;
  }
  syncUnitReadouts();
}

function refreshUnitSelects(preferredValue) {
  const addSelect = document.getElementById('new-item-unit');
  const editSelect = document.getElementById('edit-item-unit');
  const pick = (select) => {
    if (preferredValue) return preferredValue;
    const cur = select.dataset.currentUnit;
    if (cur && !isUnitActionValue(cur)) return cur;
    return !isUnitActionValue(select.value) ? select.value : null;
  };
  fillUnitSelect(addSelect, pick(addSelect));
  fillUnitSelect(editSelect, pick(editSelect));
}

function fillUnitSelect(select, selectedValue) {
  if (!select) return;
  select.innerHTML = '';
  const units = allUnits();
  if (selectedValue && !isUnitActionValue(selectedValue) && !units.includes(selectedValue)) {
    units.unshift(selectedValue);
  }
  units.forEach(unit => appendOption(select, unit, unit));
  appendOption(select, ADD_NEW_VALUE, '＋新しい単位を追加...', { bold: true });
  if (units.length) {
    appendOption(select, RENAME_VALUE, 'この単位の名前を変更...', { bold: true });
    appendOption(select, DELETE_VALUE, 'この単位を削除...', { bold: true });
  }
  const chosen = selectedValue && units.includes(selectedValue) ? selectedValue : (units[0] || defaultUnitName());
  select.value = chosen;
  select.dataset.currentUnit = chosen;
  syncUnitReadouts();
}

function unitDisplay(value) {
  return value && !isUnitActionValue(value) ? value : '';
}

function syncUnitReadouts() {
  const addSelect = document.getElementById('new-item-unit');
  const editSelect = document.getElementById('edit-item-unit');
  if (!addSelect || !editSelect) return;
  const addUnit = unitDisplay(addSelect.value);
  const editUnit = unitDisplay(editSelect.value);
  const newTarget = document.getElementById('new-target-unit');
  const newThreshold = document.getElementById('new-threshold-unit');
  const editTarget = document.getElementById('edit-target-unit');
  const editThreshold = document.getElementById('edit-threshold-unit');
  if (newTarget) newTarget.textContent = addUnit;
  if (newThreshold) newThreshold.textContent = addUnit;
  if (editTarget) editTarget.textContent = editUnit;
  if (editThreshold) editThreshold.textContent = editUnit;
}

function itemStatusBadgeHtml(item) {
  const pending = itemPendingMode(item);
  if (pending === 'shopping') return '<span class="order-badge pending-shopping">買い物中</span>';
  if (pending === 'receipt') return '<span class="order-badge pending-receipt">受け取り待ち</span>';
  if (needsOrder(item)) return '<span class="order-badge">発注</span>';
  return '';
}

function formatQty(n, unit) {
  return `${n}${unit || '個'}`;
}

function parseNonNeg(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

function fillNamedSelect(select, {
  names,
  selectedValue,
  emptyValue = '',
  emptyLabel,
  addLabel,
  datasetKey
}) {
  if (!select) return;
  select.innerHTML = '';
  if (emptyLabel != null) appendOption(select, emptyValue, emptyLabel);
  names.forEach(name => appendOption(select, name, name));
  if (addLabel) appendOption(select, ADD_NEW_VALUE, addLabel, { bold: true });
  const chosen = selectedValue && names.includes(selectedValue) ? selectedValue : emptyValue;
  select.value = chosen;
  if (datasetKey) select.dataset[datasetKey] = select.value;
}

async function handleNamedSelectAdd(select, { promptTitle, previousValue, validate, ensure, fill, syncOther }) {
  if (select.value !== ADD_NEW_VALUE) return false;
  const raw = await showPrompt(promptTitle);
  if (!raw || !raw.trim()) {
    fill(select, previousValue);
    return true;
  }
  const trimmed = raw.trim();
  if (validate && !validate(trimmed)) {
    fill(select, previousValue);
    return true;
  }
  const added = ensure(trimmed);
  persistMasters();
  fill(select, added);
  if (syncOther) syncOther();
  return true;
}

function fillCategorySelect(select, selectedValue) {
  fillNamedSelect(select, {
    names: allCategories(),
    selectedValue: normalizeCategory(selectedValue),
    emptyValue: '',
    emptyLabel: UNSET_CATEGORY_LABEL,
    addLabel: '＋新しいカテゴリを追加...'
  });
}

async function handleCategorySelectChange(select) {
  await handleNamedSelectAdd(select, {
    promptTitle: MASTER_KINDS.category.addTitle,
    previousValue: '',
    ensure: ensureCategory,
    fill: fillCategorySelect
  });
}

function fillPurchaseDestPicker(prefix, selectedNames) {
  fillNamePicker(prefix + '-purchase-dests', allPurchaseDests(), selectedNames || []);
}

function fillPlaceSelect(select, selectedValue) {
  const trimmed = String(selectedValue || '').trim();
  let names = customPlaces.filter(name => name && name !== REMOVED_LOCATION);
  if (trimmed && !names.includes(trimmed) && !isReservedPlaceName(trimmed)) {
    names = [trimmed, ...names];
  }
  fillNamedSelect(select, {
    names,
    selectedValue: trimmed,
    emptyValue: '',
    emptyLabel: UNSET_PLACE_FILTER,
    addLabel: '＋新しい場所を追加...',
    datasetKey: 'currentPlace'
  });
}

async function handlePlaceSelectChange(select) {
  if (select.value !== ADD_NEW_VALUE) {
    select.dataset.currentPlace = select.value;
    return;
  }
  await handleNamedSelectAdd(select, {
    promptTitle: MASTER_KINDS.place.addTitle,
    previousValue: select.dataset.currentPlace || '',
    validate: name => {
      if (!isReservedPlaceName(name)) return true;
      alert('その名前は場所に使えません。');
      return false;
    },
    ensure: ensurePlace,
    fill: fillPlaceSelect,
    syncOther: () => {
      const other = otherFormSelect(select, 'places');
      if (!other) return;
      const otherVal = other.value === ADD_NEW_VALUE ? '' : other.value;
      fillPlaceSelect(other, otherVal);
    }
  });
}

function getCatalogItems() {
  const items = stockItems.filter(item =>
    itemMatchesCyclePlace(item, catalogCycleFilter, catalogPlaceFilter) &&
    itemMatchesCategory(item, catalogCategoryFilter)
  );
  return items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
}

function appendFilterSelect(filterDiv, label, names, selectedValue, onChange) {
  const select = document.createElement('select');
  select.className = 'filter-select';
  select.setAttribute('aria-label', label);
  const allOption = document.createElement('option');
  allOption.value = ALL_FILTER;
  allOption.textContent = 'すべての' + label;
  select.appendChild(allOption);
  names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  const value = selectedValue !== ALL_FILTER && names.includes(selectedValue) ? selectedValue : ALL_FILTER;
  select.value = value;
  select.onchange = () => onChange(select.value);
  filterDiv.appendChild(select);
  return value;
}

function bindFilterSelect(filterDiv, label, names, selectedValue, assign) {
  return appendFilterSelect(filterDiv, label, names, selectedValue, value => {
    assign(value);
    saveAndRender();
  });
}

function bindPurchaseDestFilters(filterDiv) {
  const names = [...allPurchaseDests(), UNSET_PURCHASE_DEST_LABEL];
  const valid = new Set(names);
  [...orderPurchaseDestFilter].forEach(name => {
    if (!valid.has(name)) orderPurchaseDestFilter.delete(name);
  });
  const wrap = document.createElement('div');
  wrap.className = 'filter-dest-bar';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', '購入先');
  names.forEach(name => {
    const label = document.createElement('label');
    label.className = 'filter-dest-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = name;
    input.checked = orderPurchaseDestFilter.has(name);
    input.onchange = () => {
      if (input.checked) orderPurchaseDestFilter.add(name);
      else orderPurchaseDestFilter.delete(name);
      saveAndRender();
    };
    const span = document.createElement('span');
    span.textContent = name;
    label.appendChild(input);
    label.appendChild(span);
    wrap.appendChild(label);
  });
  filterDiv.appendChild(wrap);
}

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
    const itemNeedsOrder = needsOrderAction(item);
    const itemDiv = document.createElement('div');
    itemDiv.className = `item ${itemNeedsOrder ? 'empty' : ''} ${item.complete ? 'complete' : ''} ${String(selectedItemId) === String(item.id) ? 'selected' : ''}`;
    itemDiv.dataset.itemId = item.id;
    const lastOrderText = formatLastOrder(item.lastOrderedOn);
    const stockText = item.entered ? formatQty(item.count, item.unit) : '未入力';
    itemDiv.innerHTML = `
      <div class="item-info">
        <span class="item-name">
          <span class="item-name-text">${item.name}</span>
          ${itemStatusBadgeHtml(item)}
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

function renderFilters() {
  const filterDiv = document.getElementById('location-filters');
  filterDiv.innerHTML = '';
  if (inventoryCycleFilter !== ALL_FILTER && !customCycles.includes(inventoryCycleFilter)) {
    inventoryCycleFilter = ALL_FILTER;
  }
  if (inventoryPlaceFilter !== ALL_FILTER && inventoryPlaceFilter !== UNSET_PLACE_FILTER && !customPlaces.includes(inventoryPlaceFilter)) {
    inventoryPlaceFilter = ALL_FILTER;
  }
  inventoryCycleFilter = bindFilterSelect(filterDiv, 'チェック頻度', customCycles, inventoryCycleFilter, value => { inventoryCycleFilter = value; });
  inventoryPlaceFilter = bindFilterSelect(filterDiv, '場所', [UNSET_PLACE_FILTER, ...customPlaces], inventoryPlaceFilter, value => { inventoryPlaceFilter = value; });
  const unentered = document.createElement('label');
  unentered.className = 'filter-check';
  const unenteredInput = document.createElement('input');
  unenteredInput.type = 'checkbox';
  unenteredInput.checked = inventoryUnenteredOnly;
  unenteredInput.onchange = () => {
    inventoryUnenteredOnly = unenteredInput.checked;
    saveAndRender();
  };
  unentered.appendChild(unenteredInput);
  unentered.appendChild(document.createTextNode('未入力だけ表示'));
  filterDiv.appendChild(unentered);
  updateResetLocationButton();
}

function inventoryFilterLabel() {
  const parts = [];
  if (inventoryCycleFilter !== ALL_FILTER) parts.push(inventoryCycleFilter);
  if (inventoryPlaceFilter !== ALL_FILTER) parts.push(inventoryPlaceFilter);
  return parts.join('・');
}

function updateResetLocationButton() {
  const resetBtn = document.getElementById('reset-location-btn');
  const ctaBtn = document.getElementById('go-lohaco-select-btn');
  const row = document.getElementById('inventory-action-row');
  if (!resetBtn || !row) return;
  const label = inventoryFilterLabel();
  const showReset = !!label;
  resetBtn.hidden = !showReset;
  resetBtn.textContent = showReset ? `「${label}」をリセット` : 'リセット';
  const items = getScopeItems();
  const allEntered = items.length > 0 && items.every(item => item.entered);
  const showCta = allEntered && items.some(needsOrderAction);
  if (ctaBtn) ctaBtn.hidden = !showCta;
  row.hidden = !showReset && !showCta;
}

function goToLohacoSelect() {
  orderLohacoStepDone = false;
  showPage('order');
}

function resetEnteredItems(cycleFilter, placeFilter) {
  const scoped = cycleFilter != null || placeFilter != null;
  const targetItems = scoped
    ? stockItems.filter(item => itemMatchesCyclePlace(item, cycleFilter, placeFilter))
    : stockItems;
  const label = scoped ? inventoryFilterLabel() : '';
  if (targetItems.length === 0) {
    alert(scoped ? 'この条件にはアイテムがありません' : 'リセットするアイテムがありません');
    return;
  }
  const scope = scoped ? `「${label}」を` : 'すべて';
  if (!confirm(`${scope}リセットしますか？\nアイテム名・チェック頻度・場所・必要数はそのまま残し、すべて未入力になります。`)) {
    return;
  }
  targetItems.forEach(item => {
    item.entered = false;
  });
  saveAndRender();
}

function resetAllInventory() {
  resetEnteredItems(null, null);
}

function resetCurrentLocation() {
  if (inventoryCycleFilter === ALL_FILTER && inventoryPlaceFilter === ALL_FILTER) return;
  resetEnteredItems(inventoryCycleFilter, inventoryPlaceFilter);
}

function getScopeItems() {
  return stockItems.filter(item => itemMatchesCyclePlace(item, inventoryCycleFilter, inventoryPlaceFilter));
}

function getFilteredItems() {
  const items = getScopeItems();
  return inventoryUnenteredOnly ? items.filter(item => !item.entered) : items;
}

function placeSortIndex(place) {
  const order = inventoryPlaceOrder();
  const i = order.indexOf(place);
  return i < 0 ? 999 : i;
}

function primaryCountPlace(item) {
  const places = inventoryPlacesForItem(item);
  return places.slice().sort((a, b) => placeSortIndex(a) - placeSortIndex(b) || a.localeCompare(b, 'ja'))[0];
}

function updatePageTitle() {
  const titleEl = document.getElementById('page-title');
  if (!titleEl) return;
  titleEl.textContent = APP_TITLE;
  document.title = APP_TITLE;
}

function updateInventoryProgress() {
  const wrap = document.getElementById('inventory-progress');
  const label = document.getElementById('inventory-progress-label');
  const fill = document.getElementById('inventory-progress-fill');
  updatePageTitle();
  if (!wrap || !label || !fill) return;
  const items = getScopeItems();
  if (!items.length) {
    wrap.hidden = true;
    return;
  }
  const done = items.filter(item => item.entered).length;
  const remaining = items.length - done;
  wrap.hidden = false;
  label.textContent = inventoryUnenteredOnly
    ? (remaining === 0 ? '未入力はありません' : `残り ${remaining} 件`)
    : `${done} / ${items.length} 件入力済み`;
  fill.style.width = `${Math.round((done / items.length) * 100)}%`;
}

function inventoryPlacesForItem(item) {
  const units = itemCheckUnits(item).filter(u =>
    (inventoryCycleFilter === ALL_FILTER || u.cycle === inventoryCycleFilter) &&
    (inventoryPlaceFilter === ALL_FILTER ||
      (inventoryPlaceFilter === UNSET_PLACE_FILTER ? !u.place : u.place === inventoryPlaceFilter))
  );
  const places = [...new Set(units.map(u => u.place ? u.place : UNSET_PLACE_FILTER))];
  return places.length ? places : [UNSET_PLACE_FILTER];
}

function inventoryPlaceOrder() {
  const names = customPlaces.filter(Boolean);
  if (!names.includes(UNSET_PLACE_FILTER)) names.push(UNSET_PLACE_FILTER);
  return names;
}

function toggleInventoryPlaceGroup(place) {
  if (inventoryCollapsedPlaces.has(place)) inventoryCollapsedPlaces.delete(place);
  else inventoryCollapsedPlaces.add(place);
  persistInventoryCollapsedPlaces();
  saveAndRender();
}

function nextUnenteredIdAfter(id) {
  const visible = getFilteredItems();
  const idx = visible.findIndex(item => String(item.id) === String(id));
  const search = idx === -1 ? visible : visible.slice(idx + 1).concat(visible.slice(0, idx));
  const next = search.find(item => !item.entered);
  return next ? next.id : null;
}

function focusCountInput(id) {
  if (id == null) return;
  const target = String(id);
  const input = Array.from(document.querySelectorAll('#stock-list .count-input'))
    .find(el => String(el.dataset.itemId) === target);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus();
  input.select();
}

function renderInventory() {
  const listDiv = document.getElementById('stock-list');
  if (!listDiv) return;
  listDiv.innerHTML = '';

  const filteredItems = getFilteredItems();
  const groups = new Map();
  filteredItems.forEach(item => {
    inventoryPlacesForItem(item).forEach(place => {
      if (!groups.has(place)) groups.set(place, []);
      groups.get(place).push(item);
    });
  });
  const placeOrder = inventoryPlaceOrder();
  const keys = sortNamesByMaster(groups.keys(), placeOrder);

  if (filteredItems.length === 0) {
    listDiv.innerHTML = inventoryUnenteredOnly
      ? '<div class="empty-message">未入力のアイテムはありません。</div>'
      : '<div class="empty-message">この条件のアイテムはありません。設定のアイテムから追加してください。</div>';
    return;
  }

  keys.forEach(place => {
    const placeItems = groups.get(place).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
    const collapsed = inventoryCollapsedPlaces.has(place);
    const placeDone = placeItems.length > 0 && placeItems.every(item => item.entered);
    const group = document.createElement('div');
    group.className = `order-group${collapsed ? ' collapsed' : ''}${placeDone ? ' place-complete' : ''}`;
    group.dataset.place = place;
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'order-group-title';
    title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (placeDone) title.setAttribute('aria-label', `${place}、チェック完了、${placeItems.length}件`);
    title.innerHTML = `<span class="order-group-chevron" aria-hidden="true">${collapsed ? '▶' : '▼'}</span>${placeDone ? '<span class="order-group-check" aria-hidden="true">✓</span>' : ''}<span>${place}</span><span class="order-group-count">${placeItems.length}件</span>`;
    title.onclick = () => toggleInventoryPlaceGroup(place);
    group.appendChild(title);
    const body = document.createElement('div');
    body.className = 'order-group-items';
    placeItems.forEach(item => {
      const itemNeedsOrder = needsOrderAction(item);
      const itemDiv = document.createElement('div');
      itemDiv.className = `item inventory-item ${itemNeedsOrder ? 'empty' : ''} ${item.complete ? 'complete' : ''} ${String(selectedItemId) === String(item.id) ? 'selected' : ''}`;
      itemDiv.dataset.itemId = item.id;
      const countDisplay = item.entered ? String(item.count) : '';
      const showCount = primaryCountPlace(item) === place;
      const minusDisabled = item.entered && item.count <= 0;
      const countControls = showCount ? `
                  <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1減らす" ${minusDisabled ? 'disabled' : ''} onclick="adjustCount(event, this.dataset.itemId, -1)">−</button>
                  <input type="text" class="count-input${item.entered ? '' : ' unentered'}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="${item.name}の在庫数" value="${countDisplay}" data-item-id="${item.id}" onfocus="this.select()" oninput="filterCountInput(this)" onchange="updateCountDirect(this.dataset.itemId, this.value)" onkeydown="handleCountKey(event)">
                  <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1増やす" onclick="adjustCount(event, this.dataset.itemId, 1)">＋</button>
                  <span class="unit-suffix">${item.unit}</span>` : `<span class="count-shared-note">「${primaryCountPlace(item)}」で入力${item.entered ? ` · ${formatQty(item.count, item.unit)}` : ' · 未入力'}</span>`;
      itemDiv.innerHTML = `
        <div class="inventory-line">
          <button type="button" class="item-edit-btn" data-item-id="${item.id}" aria-label="${item.name}を編集" onclick="selectAndEditItem(this.dataset.itemId)">⋯</button>
          <span class="item-name">
            <span class="item-name-text">${item.name}</span>
            ${itemStatusBadgeHtml(item)}
          </span>
          <div class="inventory-count">${countControls}</div>
        </div>
      `;
      body.appendChild(itemDiv);
    });
    group.appendChild(body);
    listDiv.appendChild(group);
  });
}

function renderAll() {
  renderInventory();
  renderOrderList();
  renderItemsCatalog();
  renderSettings();
  updateResetLocationButton();
  updateInventoryProgress();
}

function selectAndEditItem(id) {
  selectedItemId = id;
  document.querySelectorAll('#stock-list .item, #item-catalog-list .item').forEach(el => {
    el.classList.toggle('selected', String(el.dataset.itemId) === String(id));
  });
  openEditModal(id);
}

function openEditModal(id) {
  const item = findItemById(id);
  if (!item) return;
  editingItemId = id;
  document.getElementById('edit-item-name').value = item.name;
  fillUnitSelect(document.getElementById('edit-item-unit'), item.unit);
  document.getElementById('edit-item-target').value = item.target;
  document.getElementById('edit-item-threshold').value = item.orderThreshold;
  fillCategorySelect(document.getElementById('edit-item-category'), item.category);
  fillPurchaseDestPicker('edit-item', itemPurchaseDests(item));
  fillCyclePlacePickers('edit-item', itemCheckUnits(item));
  renderLinkedProducts('edit-item-linked-products', item.id);
  syncUnitReadouts();
  document.getElementById('edit-modal').style.display = 'flex';
  syncBodyScrollLock();
  revealItemFormStart('edit-modal', 'edit-item-name', { select: true });
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  editingItemId = null;
  syncBodyScrollLock();
}

function itemFormFieldsHtml(prefix, options = {}) {
  const targetAttr = options.targetValue != null ? ` value="${options.targetValue}"` : '';
  const thresholdAttr = options.thresholdValue != null ? ` value="${options.thresholdValue}"` : '';
  const readout = prefix === 'new-item' ? 'new' : 'edit';
  return `
      <label for="${prefix}-category">カテゴリ</label>
      <select id="${prefix}-category" onchange="handleCategorySelectChange(this)"></select>
      <label>購入先</label>
      <div class="check-unit-picker-box">
        <div class="check-unit-picker-toolbar">
          <button type="button" class="picker-add-btn" onclick="addNameFromForm('purchaseDest', '${prefix}-purchase-dests')" aria-label="新しい購入先を追加">＋</button>
        </div>
        <div class="check-unit-picker" id="${prefix}-purchase-dests"></div>
      </div>
      <div class="field-pair cycle-place-pair">
        <div class="field">
          <label>チェック頻度</label>
          <div class="check-unit-picker-box">
            <div class="check-unit-picker-toolbar">
              <button type="button" class="picker-add-btn" onclick="addNameFromForm('cycle', '${prefix}-cycles')" aria-label="新しいチェック頻度を追加">＋</button>
            </div>
            <div class="check-unit-picker" id="${prefix}-cycles"></div>
          </div>
        </div>
        <div class="field">
          <label for="${prefix}-places">場所</label>
          <select id="${prefix}-places" onchange="handlePlaceSelectChange(this)"></select>
        </div>
      </div>
      <label for="${prefix}-unit">単位</label>
      <select id="${prefix}-unit" onchange="handleUnitSelectChange(this)"></select>
      <label for="${prefix}-target">必要数量</label>
      <div class="input-with-unit">
        <input type="number" id="${prefix}-target" min="0" inputmode="numeric"${targetAttr}>
        <span class="unit-readout" id="${readout}-target-unit"></span>
      </div>
      <label for="${prefix}-threshold">補充基準数</label>
      <div class="input-with-unit">
        <input type="number" id="${prefix}-threshold" min="0" inputmode="numeric"${thresholdAttr}>
        <span class="unit-readout" id="${readout}-threshold-unit"></span>
      </div>
      <span class="field-hint">在庫がこの数以下になると発注対象になります</span>
      ${prefix === 'edit-item' ? `<label>商品</label><p class="settings-hint">名前だけで足せます。購入先はアイテムのものを使います。</p><div id="${prefix}-linked-products" class="linked-products"></div>` : ''}
  `;
}

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

function mountItemForms() {
  const edit = document.getElementById('edit-item-form');
  const add = document.getElementById('new-item-form');
  if (edit) edit.innerHTML = itemFormFieldsHtml('edit-item');
  if (add) add.innerHTML = itemFormFieldsHtml('new-item', {
    targetValue: 1,
    thresholdValue: 0
  });
}

function readItemForm(prefix) {
  const name = document.getElementById(prefix + '-name').value.trim();
  const picked = unitsFromCyclePlacePickers(prefix);
  const unit = document.getElementById(prefix + '-unit').value;
  const category = normalizeCategory(document.getElementById(prefix + '-category').value);
  const purchaseDests = normalizePurchaseDests(getSelectedNames(prefix + '-purchase-dests'));
  const target = parseNonNeg(document.getElementById(prefix + '-target').value);
  const orderThreshold = parseNonNeg(document.getElementById(prefix + '-threshold').value);
  if (!name) {
    alert('アイテム名を入力してください');
    return null;
  }
  if (!picked.cycles.length) {
    alert('チェック頻度を1つ以上選んでください');
    return null;
  }
  if (!unit || isUnitActionValue(unit)) {
    alert('単位を選択してください');
    return null;
  }
  return { name, picked, unit, category, purchaseDests, target, orderThreshold };
}

function applyFormToItem(item, fields) {
  rememberUnit(fields.unit);
  persistMasters();
  item.name = fields.name;
  item.category = fields.category;
  if (item.category) ensureCategory(item.category);
  item.purchaseDests = normalizePurchaseDests(fields.purchaseDests);
  item.purchaseDests.forEach(dest => ensurePurchaseDest(dest));
  item.unit = fields.unit;
  item.target = fields.target;
  item.orderThreshold = fields.orderThreshold;
  setItemCheckUnits(item, fields.picked.units);
}

function saveItemEdit() {
  const item = findItemById(editingItemId);
  if (!item) return;
  const fields = readItemForm('edit-item');
  if (!fields) return;
  applyFormToItem(item, fields);
  closeEditModal();
  saveAndRender();
}

function deleteEditingItem() {
  if (editingItemId) deleteItem(editingItemId);
}

function handleCountKey(event) {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    event.target.blur();
  }
}

function filterCountInput(input) {
  input.value = input.value.replace(/[^\d]/g, '');
}


// 数量を直接入力して変更する関数

function adjustCount(event, id, delta) {
  event.stopPropagation();
  const item = findItemById(id);
  if (!item) return;
  const step = Number(delta);
  if (item.entered && item.count <= 0 && step < 0) return;
  const current = item.entered ? item.count : 0;
  const next = Math.max(0, current + step);
  updateCountDirect(id, String(next), { keepFocus: true });
}

function updateCountDirect(id, value, options) {
  const item = findItemById(id);
  if (!item) return;
  const trimmed = String(value).trim();
  let moveToUnentered = false;
  if (trimmed === '') {
    item.count = 0;
    item.entered = false;
  } else {
    const newCount = parseInt(trimmed, 10);
    if (isNaN(newCount)) return;
    item.count = newCount < 0 ? 0 : newCount;
    item.entered = true;
    moveToUnentered = true;
  }
  const jump = moveToUnentered && !(options && options.keepFocus);
  const nextId = jump ? nextUnenteredIdAfter(id) : null;
  saveAndRender();
  if (nextId != null) {
    requestAnimationFrame(() => focusCountInput(nextId));
  }
}


// アイテムを追加する関数

function addItem() {
  const fields = readItemForm('new-item');
  if (!fields) return;
  const item = {
    id: newItemId(),
    count: 0,
    entered: false,
    lastOrderedOn: null,
    pendingMode: null,
    pendingDest: '',
    pendingQty: null,
    pendingProductId: ''
  };
  applyFormToItem(item, fields);
  stockItems.push(item);
  closeModal();
  saveAndRender();
}


// アイテムを削除する関数

async function deleteItem(id) {
  if (!confirm('このアイテムを削除しますか？')) return;
  const key = String(id);
  stockItems = stockItems.filter(i => String(i.id) !== key);
  selectedItemId = null;
  closeEditModal();
  await persistAndFlushCloud();
}
