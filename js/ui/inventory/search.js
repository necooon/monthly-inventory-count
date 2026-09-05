function inventorySearchText() {
  return inventorySearchQuery.trim().toLowerCase();
}

function hasInventorySearchQuery() {
  return !!inventorySearchText();
}

function itemSearchFields(item) {
  const fields = [item.name];
  productsForItem(item.id).forEach(product => {
    fields.push(product.name, product.barcode);
  });
  return fields.map(value => String(value || '').toLowerCase());
}

function itemMatchesInventorySearch(item, query) {
  return itemSearchFields(item).some(text => text.includes(query));
}

function getFilteredItems() {
  const items = getScopeItems();
  const query = inventorySearchText();
  if (!query) return items;
  return items.filter(item => itemMatchesInventorySearch(item, query));
}

function syncInventorySearchInput() {
  const searchInput = document.getElementById('inventory-search-input');
  if (searchInput && searchInput.value !== inventorySearchQuery) {
    searchInput.value = inventorySearchQuery;
  }
}

function clearInventorySearch() {
  inventorySearchQuery = '';
  syncInventorySearchInput();
}

function setInventorySearchToolbarVisible(visible) {
  const searchToolbar = document.getElementById('inventory-search-toolbar');
  if (searchToolbar) searchToolbar.hidden = !visible;
  const appHeader = document.getElementById('app-header');
  if (appHeader) appHeader.classList.toggle('inventory-search-pinned', visible);
}

function handleInventorySearch(input) {
  inventorySearchQuery = input.value;
  const listDiv = document.getElementById('stock-list');
  if (listDiv && isInventoryPlaceDetailView()) renderInventoryDetailList(listDiv);
}
