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

function applyCountToItem(id, value) {
  const item = findItemById(id);
  if (!item) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') {
    item.count = 0;
    item.entered = false;
    return { item, moveToUnentered: false };
  }
  const newCount = parseInt(trimmed, 10);
  if (isNaN(newCount)) return null;
  item.count = newCount < 0 ? 0 : newCount;
  item.entered = true;
  return { item, moveToUnentered: true };
}

function syncInventoryItemCard(itemId) {
  const item = findItemById(itemId);
  if (!item) return;
  const card = document.getElementById(`inventory-item-${itemId}`);
  if (!card) return;
  const activeInput = document.activeElement;
  const focused = activeInput && activeInput.classList.contains('count-input') && String(activeInput.dataset.itemId) === String(itemId);
  const selStart = focused ? activeInput.selectionStart : null;
  const selEnd = focused ? activeInput.selectionEnd : null;
  card.className = itemCardClassName(item, 'inventory-item');
  card.innerHTML = inventoryItemRowInnerHtml(item);
  if (focused) {
    const input = card.querySelector('.count-input');
    if (input) {
      input.focus();
      if (selStart != null && selEnd != null) input.setSelectionRange(selStart, selEnd);
    }
  }
  updateInventoryHeaderMode();
}

function handleCountInput(input) {
  filterCountInput(input);
  const itemId = input.dataset.itemId;
  if (!applyCountToItem(itemId, input.value)) return;
  syncInventoryItemCard(itemId);
  scheduleLocalAutosave();
}

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
  const applied = applyCountToItem(id, value);
  if (!applied) return;
  const jump = applied.moveToUnentered && !(options && options.keepFocus);
  const nextId = jump ? nextUnenteredIdAfter(id) : null;
  persistAutosave({ render: true });
  if (nextId != null) {
    requestAnimationFrame(() => focusCountInput(nextId));
  }
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
  const card = document.getElementById(`inventory-item-${target}`);
  const input = Array.from(document.querySelectorAll('#stock-list .count-input'))
    .find(el => String(el.dataset.itemId) === target);
  const el = input || card;
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (!input) return;
  input.focus();
  input.select();
}
