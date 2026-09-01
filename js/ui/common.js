function formatQty(n, unit) {
  return `${n}${unit || '個'}`;
}

function parseNonNeg(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

function appendFilterSelect(filterDiv, label, names, selectedValue, onChange) {
  const select = document.createElement('select');
  select.className = 'filter-select';
  select.setAttribute('aria-label', label);
  const allOption = document.createElement('option');
  allOption.value = C.ALL_FILTER;
  allOption.textContent = 'すべての' + label;
  select.appendChild(allOption);
  names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  const value = selectedValue !== C.ALL_FILTER && names.includes(selectedValue) ? selectedValue : C.ALL_FILTER;
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

function updatePageTitle() {
  const titleEl = document.getElementById('page-title');
  if (!titleEl) return;
  titleEl.textContent = C.APP_TITLE;
  document.title = C.APP_TITLE;
}

function showPage(page) {
  if (page === 'items') page = 'settings';
  S().ui.currentPage = page;
  localStorage.setItem('currentPage', page);
  C.PAGE_IDS.forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('active', p === page);
    const nav = document.getElementById(`nav-${p}`);
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

window.showPage = showPage;
window.formatQty = formatQty;
