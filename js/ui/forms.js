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

function isUnitActionValue(value) {
  return value === C.ADD_NEW_VALUE || value === C.RENAME_VALUE || value === C.DELETE_VALUE;
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
  fillNamePicker(prefix + '-cycles', S().masters.cycles, [...new Set(units.map(u => u.cycle).filter(Boolean))]);
  const places = [...new Set(units.map(u => u.place).filter(Boolean))];
  fillPlaceSelect(document.getElementById(prefix + '-places'), places[0] || '');
}

function selectedPlacesFromPrefix(prefix) {
  const select = document.getElementById(prefix + '-places');
  if (!select) return [];
  const value = String(select.value || '').trim();
  if (!value || value === C.ADD_NEW_VALUE) return [];
  return [value];
}

function unitsFromCyclePlacePickers(prefix) {
  const cycles = getSelectedNames(prefix + '-cycles');
  const places = selectedPlacesFromPrefix(prefix);
  const units = [];
  if (cycles.length && !places.length) {
    cycles.forEach(cycle => {
      const unit = M.ensureCheckUnit(cycle, '');
      if (unit) units.push(unit);
    });
  } else {
    cycles.forEach(cycle => {
      places.forEach(place => {
        const unit = M.ensureCheckUnit(cycle, place);
        if (unit) units.push(unit);
      });
    });
  }
  return { cycles, places, units };
}

function refreshCyclePlacePickers(extraSelected) {
  ['new-item', 'edit-item'].forEach(prefix => {
    const selected = unitsFromCyclePlacePickers(prefix).units;
    if (extraSelected && !selected.some(u => I.unitsEqual(u, extraSelected))) selected.push(extraSelected);
    fillCyclePlacePickers(prefix, selected);
  });
}

function itemFieldsHtml(item, options) {
  const cycles = [...new Set(I.itemCheckUnits(item).map(u => u.cycle))];
  const places = [...new Set(I.itemCheckUnits(item).map(u => I.placeLabel(u.place)))];
  const category = I.normalizeCategory(item.category) || C.UNSET_CATEGORY_LABEL;
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
  if (!hidePlace) {
    rows.push(`<div class="item-field"><span class="item-field-label">場所</span><span class="item-location-wrap">${chips(places.length ? places : [C.UNSET_PLACE_FILTER])}</span></div>`);
  }
  if (!rows.length) return '';
  return `<div class="item-fields">${rows.join('')}</div>`;
}

async function addNameFromForm(kind, containerId) {
  const spec = M.MASTER_KINDS[kind];
  const selected = getSelectedNames(containerId);
  const raw = await showPrompt(spec.addTitle);
  if (!raw || !raw.trim()) return;
  const trimmed = raw.trim();
  if (kind === 'place' && trimmed === C.REMOVED_LOCATION) {
    alert('「その他」は使えません。具体的な名前を入力してください。');
    return;
  }
  spec.ensure(trimmed);
  CheckStock.storage.persistMasters();
  if (!selected.includes(trimmed)) selected.push(trimmed);
  fillNamePicker(containerId, spec.uniqueNames(), selected);
}

async function addNewUnit() {
  const raw = await showPrompt('新しい単位を入力してください（例：束）');
  if (!raw || raw.trim() === '') return null;
  const trimmed = raw.trim();
  M.ensureUnit(trimmed);
  CheckStock.storage.persistMasters();
  scheduleCloudSave();
  return trimmed;
}

async function handleUnitSelectChange(select) {
  const previous = select.dataset.currentUnit || '';
  if (select.value === C.ADD_NEW_VALUE) {
    const added = await addNewUnit();
    fillUnitSelect(select, added || previous || M.defaultUnitName());
    const other = otherFormSelect(select, 'unit');
    if (other) fillUnitSelect(other, other.dataset.currentUnit || M.defaultUnitName());
  } else if (select.value === C.RENAME_VALUE) {
    fillUnitSelect(select, previous);
    if (previous) {
      const next = await renameMasterName('unit', previous);
      const chosen = next || previous;
      fillUnitSelect(select, chosen);
      const other = otherFormSelect(select, 'unit');
      if (other) {
        const otherVal = other.dataset.currentUnit === previous ? chosen : other.dataset.currentUnit;
        fillUnitSelect(other, otherVal || M.defaultUnitName());
      }
    }
  } else if (select.value === C.DELETE_VALUE) {
    fillUnitSelect(select, previous);
    if (previous) {
      await deleteMasterName('unit', previous);
      const names = I.allUnits();
      const chosen = names.includes(previous) ? previous : (names[0] || M.defaultUnitName());
      fillUnitSelect(select, chosen);
      const other = otherFormSelect(select, 'unit');
      if (other) {
        const otherVal = other.dataset.currentUnit;
        fillUnitSelect(other, names.includes(otherVal) ? otherVal : (names[0] || M.defaultUnitName()));
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
  const units = I.allUnits();
  if (selectedValue && !isUnitActionValue(selectedValue) && !units.includes(selectedValue)) {
    units.unshift(selectedValue);
  }
  units.forEach(unit => appendOption(select, unit, unit));
  appendOption(select, C.ADD_NEW_VALUE, '＋新しい単位を追加...', { bold: true });
  if (units.length) {
    appendOption(select, C.RENAME_VALUE, 'この単位の名前を変更...', { bold: true });
    appendOption(select, C.DELETE_VALUE, 'この単位を削除...', { bold: true });
  }
  const chosen = selectedValue && units.includes(selectedValue) ? selectedValue : (units[0] || M.defaultUnitName());
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
  if (addLabel) appendOption(select, C.ADD_NEW_VALUE, addLabel, { bold: true });
  const chosen = selectedValue && names.includes(selectedValue) ? selectedValue : emptyValue;
  select.value = chosen;
  if (datasetKey) select.dataset[datasetKey] = select.value;
}

async function handleNamedSelectAdd(select, { promptTitle, previousValue, validate, ensure, fill, syncOther }) {
  if (select.value !== C.ADD_NEW_VALUE) return false;
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
  CheckStock.storage.persistMasters();
  fill(select, added);
  if (syncOther) syncOther();
  return true;
}

function fillCategorySelect(select, selectedValue) {
  fillNamedSelect(select, {
    names: I.allCategories(),
    selectedValue: I.normalizeCategory(selectedValue),
    emptyValue: '',
    emptyLabel: C.UNSET_CATEGORY_LABEL,
    addLabel: '＋新しいカテゴリを追加...'
  });
}

async function handleCategorySelectChange(select) {
  await handleNamedSelectAdd(select, {
    promptTitle: M.MASTER_KINDS.category.addTitle,
    previousValue: '',
    ensure: M.ensureCategory,
    fill: fillCategorySelect
  });
}

function fillPlaceSelect(select, selectedValue) {
  fillNamedSelect(select, {
    names: S().masters.places.filter(name => name && name !== C.REMOVED_LOCATION),
    selectedValue: String(selectedValue || '').trim(),
    emptyValue: '',
    emptyLabel: C.UNSET_PLACE_FILTER,
    addLabel: '＋新しい場所を追加...',
    datasetKey: 'currentPlace'
  });
}

async function handlePlaceSelectChange(select) {
  if (select.value !== C.ADD_NEW_VALUE) {
    select.dataset.currentPlace = select.value;
    return;
  }
  await handleNamedSelectAdd(select, {
    promptTitle: M.MASTER_KINDS.place.addTitle,
    previousValue: select.dataset.currentPlace || '',
    validate: name => {
      if (!M.isReservedPlaceName(name)) return true;
      alert('その名前は場所に使えません。');
      return false;
    },
    ensure: M.ensurePlace,
    fill: fillPlaceSelect,
    syncOther: () => {
      const other = otherFormSelect(select, 'places');
      if (!other) return;
      const otherVal = other.value === C.ADD_NEW_VALUE ? '' : other.value;
      fillPlaceSelect(other, otherVal);
    }
  });
}

function itemFormFieldsHtml(prefix, options = {}) {
  const namePh = options.namePlaceholder || 'アイテム名';
  const targetAttr = options.targetValue != null ? ` value="${options.targetValue}"` : '';
  const thresholdAttr = options.thresholdValue != null ? ` value="${options.thresholdValue}"` : '';
  const readout = prefix === 'new-item' ? 'new' : 'edit';
  return `
      <label for="${prefix}-name">アイテム名</label>
      <input type="text" id="${prefix}-name" placeholder="${namePh}">
      <label for="${prefix}-category">カテゴリ</label>
      <select id="${prefix}-category" onchange="handleCategorySelectChange(this)"></select>
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
  `;
}

function mountItemForms() {
  const edit = document.getElementById('edit-item-form');
  const add = document.getElementById('new-item-form');
  if (edit) edit.innerHTML = itemFormFieldsHtml('edit-item');
  if (add) add.innerHTML = itemFormFieldsHtml('new-item', {
    namePlaceholder: 'アイテム名（例：シャンプー）',
    targetValue: 1,
    thresholdValue: 0
  });
}

function readItemForm(prefix) {
  const name = document.getElementById(prefix + '-name').value.trim();
  const picked = unitsFromCyclePlacePickers(prefix);
  const unit = document.getElementById(prefix + '-unit').value;
  const category = I.normalizeCategory(document.getElementById(prefix + '-category').value);
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
  return { name, picked, unit, category, target, orderThreshold };
}

function applyFormToItem(item, fields) {
  I.rememberUnit(fields.unit);
  CheckStock.storage.persistMasters();
  item.name = fields.name;
  item.category = fields.category;
  if (item.category) M.ensureCategory(item.category);
  item.unit = fields.unit;
  item.target = fields.target;
  item.orderThreshold = fields.orderThreshold;
  I.setItemCheckUnits(item, fields.picked.units);
}

function saveItemEdit() {
  const item = I.findItemById(S().ui.editingItemId);
  if (!item) return;
  const fields = readItemForm('edit-item');
  if (!fields) return;
  applyFormToItem(item, fields);
  closeEditModal();
  saveAndRender();
}

function addItem() {
  const fields = readItemForm('new-item');
  if (!fields) return;
  const item = {
    id: I.newItemId(),
    count: 0,
    entered: false,
    lastOrderedOn: null
  };
  applyFormToItem(item, fields);
  S().stockItems.push(item);
  closeModal();
  saveAndRender();
}

async function deleteItem(id) {
  if (!confirm('このアイテムを削除しますか？')) return;
  const key = String(id);
  S().stockItems = S().stockItems.filter(i => String(i.id) !== key);
  S().ui.selectedItemId = null;
  closeEditModal();
  await CheckStock.storage.persistAndFlushCloud();
}

window.addNameFromForm = addNameFromForm;
window.handleCategorySelectChange = handleCategorySelectChange;
window.handlePlaceSelectChange = handlePlaceSelectChange;
window.handleUnitSelectChange = handleUnitSelectChange;
window.saveItemEdit = saveItemEdit;
window.addItem = addItem;
window.mountItemForms = mountItemForms;
