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
