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
