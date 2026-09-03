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
