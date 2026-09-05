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

const ITEM_STATUS_BADGES = {
  shopping: { className: 'order-badge pending-shopping', label: '買い物中' },
  receipt: { className: 'order-badge pending-receipt', label: '受け取り待ち' },
  'stock-empty': { className: 'order-badge stock-empty', label: '在庫切れ' },
  'stock-ok': { className: 'order-badge stock-ok', label: '在庫OK' }
};

function itemCardClassName(item, extraClass) {
  const status = itemCardStatus(item);
  const stockClass = status === 'stock-empty' || status === 'stock-ok' ? status : '';
  const unentered = item.entered ? '' : 'unentered';
  const selected = String(selectedItemId) === String(item.id) ? 'selected' : '';
  return ['item', extraClass, stockClass, unentered, selected].filter(Boolean).join(' ');
}

function itemStatusBadgeHtml(item) {
  const spec = ITEM_STATUS_BADGES[itemCardStatus(item)];
  return spec ? `<span class="${spec.className}">${spec.label}</span>` : '';
}

function itemNameHtml(item) {
  const warn = item.entered ? '' : '<span class="unentered-icon" role="img" aria-label="未入力">⚠</span>';
  return `<span class="item-name"><span class="item-name-text">${item.name}</span>${warn}${itemStatusBadgeHtml(item)}</span>`;
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
