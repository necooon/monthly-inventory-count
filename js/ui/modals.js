let promptResolver = null;

function overlayIsOpen(el) {
  return el && el.style.display === 'flex';
}

function openOverlays() {
  return ['prompt-modal', 'edit-modal', 'add-modal']
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
  if (overlayIsOpen(document.getElementById('edit-modal'))) {
    closeEditModal();
    return;
  }
  if (overlayIsOpen(document.getElementById('add-modal'))) {
    closeModal();
  }
}

function overlayFocusables(overlay) {
  return Array.from(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}

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

document.getElementById('prompt-input').addEventListener('keydown', (e) => {
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

function openModal() {
  const st = CheckStock.state;
  document.getElementById('add-modal').style.display = 'flex';
  const preset = [];
  if (st.ui.currentPage === 'settings') {
    const cat = st.filters.catalog;
    if (cat.cycle !== C.ALL_FILTER && cat.place !== C.ALL_FILTER) {
      preset.push({ cycle: cat.cycle, place: cat.place });
    }
  } else {
    const inv = st.filters.inventory;
    if (inv.cycle !== C.ALL_FILTER && inv.place !== C.ALL_FILTER) {
      preset.push({ cycle: inv.cycle, place: inv.place });
    }
  }
  const checkUnits = st.masters.checkUnits;
  fillCyclePlacePickers('new-item', preset.length ? preset : (checkUnits[0] ? [checkUnits[0]] : []));
  fillCategorySelect(document.getElementById('new-item-category'), '');
  fillUnitSelect(document.getElementById('new-item-unit'), '個');
  document.getElementById('new-item-target').value = 1;
  document.getElementById('new-item-threshold').value = 0;
  syncBodyScrollLock();
  document.getElementById('new-item-name').focus();
}

function closeModal() {
  document.getElementById('add-modal').style.display = 'none';
  document.getElementById('new-item-name').value = '';
  document.getElementById('new-item-target').value = 1;
  document.getElementById('new-item-threshold').value = 0;
  syncBodyScrollLock();
}

function openEditModal(id) {
  const item = I.findItemById(id);
  if (!item) return;
  CheckStock.state.ui.editingItemId = id;
  document.getElementById('edit-item-name').value = item.name;
  fillUnitSelect(document.getElementById('edit-item-unit'), item.unit);
  document.getElementById('edit-item-target').value = item.target;
  document.getElementById('edit-item-threshold').value = item.orderThreshold;
  fillCategorySelect(document.getElementById('edit-item-category'), item.category);
  fillCyclePlacePickers('edit-item', I.itemCheckUnits(item));
  syncUnitReadouts();
  document.getElementById('edit-modal').style.display = 'flex';
  syncBodyScrollLock();
  document.getElementById('edit-item-name').focus();
  document.getElementById('edit-item-name').select();
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  CheckStock.state.ui.editingItemId = null;
  syncBodyScrollLock();
}

function deleteEditingItem() {
  const editingItemId = CheckStock.state.ui.editingItemId;
  if (editingItemId) deleteItem(editingItemId);
}

window.resolvePrompt = resolvePrompt;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeEditModal = closeEditModal;
window.deleteEditingItem = deleteEditingItem;
