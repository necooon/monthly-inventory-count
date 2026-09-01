function bindSettingsSectionOpen(details, key) {
  details.dataset.settingsSection = key;
  const shouldOpen = S().ui.settingsOpenSections.has(key);
  if (details.dataset.settingsToggleBound !== '1') {
    details.dataset.settingsToggleBound = '1';
    details.addEventListener('toggle', () => {
      const sections = S().ui.settingsOpenSections;
      if (details.open) sections.add(key);
      else sections.delete(key);
      CheckStock.storage.persistSettingsOpenSections();
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
    if (options.reorder) {
      const index = names.indexOf(name);
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'settings-move';
      upBtn.textContent = '↑';
      upBtn.setAttribute('aria-label', name + 'を上へ');
      upBtn.disabled = isLocked || index <= 0;
      upBtn.onclick = () => CheckStock.masters.moveMasterName(kind, name, -1);
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'settings-move';
      downBtn.textContent = '↓';
      downBtn.setAttribute('aria-label', name + 'を下へ');
      downBtn.disabled = isLocked || index >= names.length - 1;
      downBtn.onclick = () => CheckStock.masters.moveMasterName(kind, name, 1);
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
  const st = S();
  const itemsSection = document.querySelector('#page-settings [data-settings-section="items"]');
  if (itemsSection) bindSettingsSectionOpen(itemsSection, 'items');
  const root = document.getElementById('settings-list');
  if (!root) return;
  root.innerHTML = '';
  appendSettingsSection(root, 'チェック頻度', 'cycle', st.masters.cycles.slice(), {
    hint: '月次・週次など、いつ数えるかの区分です。'
  });
  appendSettingsSection(root, '場所', 'place', st.masters.places.slice(), {
    hint: '棚卸しのときに回る場所です。↑↓で並び順を変えられます。',
    reorder: true
  });
  appendSettingsSection(root, 'カテゴリ', 'category', I.settingsCategoryNames(), {
    hint: '買い物リストのまとめに使います。↑↓で並び順を変えられます。',
    reorder: true
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
