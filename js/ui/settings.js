function bindSettingsSectionOpen(details, key) {
  details.dataset.settingsSection = key;
  const shouldOpen = settingsOpenSections.has(key);
  if (details.dataset.settingsToggleBound !== '1') {
    details.dataset.settingsToggleBound = '1';
    details.addEventListener('toggle', () => {
      if (details.open) settingsOpenSections.add(key);
      else settingsOpenSections.delete(key);
      persistSettingsOpenSections();
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
    if (typeof options.nameExtra === 'function') {
      const extra = options.nameExtra(name);
      if (extra) {
        const chip = document.createElement('span');
        chip.className = 'settings-row-extra';
        chip.textContent = extra;
        label.appendChild(chip);
      }
    }
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
    if (typeof options.extraAction === 'function') options.extraAction(name, row);
    if (options.reorder) {
      const index = names.indexOf(name);
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'settings-move';
      upBtn.textContent = '↑';
      upBtn.setAttribute('aria-label', name + 'を上へ');
      upBtn.disabled = isLocked || index <= 0;
      upBtn.onclick = () => moveMasterName(kind, name, -1);
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'settings-move';
      downBtn.textContent = '↓';
      downBtn.setAttribute('aria-label', name + 'を下へ');
      downBtn.disabled = isLocked || index >= names.length - 1;
      downBtn.onclick = () => moveMasterName(kind, name, 1);
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

function setCloudConnectStatus(el, text, kind) {
  el.textContent = text;
  el.className = 'settings-connect-status' + (kind ? ' is-' + kind : '');
}

function appendCloudConnectSection(root) {
  const config = getActiveSupabaseConfig();
  const projectRef = supabaseProjectRef(config.url);
  const section = document.createElement('div');
  section.className = 'settings-section settings-cloud';

  const heading = document.createElement('h3');
  heading.textContent = 'クラウド接続';
  section.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'settings-hint';
  hint.textContent = '新しい Supabase プロジェクトへ切り替えるときは、Project URL と anon public key を入れて再接続します。先に SQL Editor で setup.sql を実行してください。';
  section.appendChild(hint);

  const status = document.createElement('p');
  const sourceLabel = config.source === 'override' ? 'この端末の設定' : '初期設定';
  setCloudConnectStatus(
    status,
    isCloudReady()
      ? '接続中: ' + (projectRef || config.url) + '（' + sourceLabel + '）'
      : '未接続',
    isCloudReady() ? 'ok' : 'error'
  );
  section.appendChild(status);

  const form = document.createElement('form');
  form.className = 'settings-cloud-form';

  const urlField = document.createElement('label');
  urlField.className = 'settings-field';
  const urlLabel = document.createElement('span');
  urlLabel.textContent = 'Project URL';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.inputMode = 'url';
  urlInput.name = 'supabaseUrl';
  urlInput.autocomplete = 'off';
  urlInput.spellcheck = false;
  urlInput.placeholder = 'https://xxxx.supabase.co';
  urlInput.value = config.url;
  urlField.appendChild(urlLabel);
  urlField.appendChild(urlInput);
  form.appendChild(urlField);

  const keyField = document.createElement('label');
  keyField.className = 'settings-field';
  const keyLabel = document.createElement('span');
  keyLabel.textContent = 'anon public key';
  const keyInput = document.createElement('textarea');
  keyInput.name = 'supabaseAnonKey';
  keyInput.autocomplete = 'off';
  keyInput.spellcheck = false;
  keyInput.rows = 3;
  keyInput.placeholder = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  keyInput.value = config.anonKey;
  keyField.appendChild(keyLabel);
  keyField.appendChild(keyInput);
  form.appendChild(keyField);

  const actions = document.createElement('div');
  actions.className = 'settings-cloud-actions';

  const connectBtn = document.createElement('button');
  connectBtn.type = 'submit';
  connectBtn.className = 'open-modal-btn settings-connect-btn';
  connectBtn.textContent = '再接続';
  actions.appendChild(connectBtn);

  if (hasSupabaseOverride()) {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'settings-add';
    resetBtn.textContent = '初期設定に戻す';
    resetBtn.onclick = async () => {
      if (!confirm('初期設定のプロジェクトに戻しますか？')) return;
      resetBtn.disabled = true;
      connectBtn.disabled = true;
      setCloudConnectStatus(status, '接続しています…', '');
      try {
        await resetSupabaseConnection();
        renderSettings();
      } catch (e) {
        setCloudConnectStatus(status, e.message || '接続に失敗しました。', 'error');
        resetBtn.disabled = false;
        connectBtn.disabled = false;
      }
    };
    actions.appendChild(resetBtn);
  }

  form.appendChild(actions);

  form.onsubmit = async event => {
    event.preventDefault();
    let config;
    try {
      config = parseSupabaseConfig(urlInput.value, keyInput.value);
    } catch (e) {
      setCloudConnectStatus(status, e.message || '接続に失敗しました。', 'error');
      return;
    }
    const current = getActiveSupabaseConfig();
    const same = config.url === current.url && config.anonKey === current.anonKey;
    if (!same && !confirm('接続先を切り替えますか？新しいプロジェクトにデータがあればそれを取り込み、空なら今のデータを送ります。')) {
      return;
    }
    connectBtn.disabled = true;
    setCloudConnectStatus(status, '接続しています…', '');
    try {
      await applySupabaseConfig(config, true);
      renderSettings();
    } catch (e) {
      setCloudConnectStatus(status, e.message || '接続に失敗しました。', 'error');
      connectBtn.disabled = false;
    }
  };

  section.appendChild(form);

  const extra = document.createElement('p');
  extra.className = 'settings-hint';
  extra.textContent = 'LOHACO の商品情報取得には Edge Function が必要です。GitHub の SUPABASE_PROJECT_ID を新しいプロジェクト ID に更新し、Deploy Supabase Functions を実行してください。他の端末でも同じ URL と key を入れてください。';
  section.appendChild(extra);
  root.appendChild(section);
}

function renderSettings() {
  const itemsSection = document.querySelector('#page-settings [data-settings-section="items"]');
  if (itemsSection) bindSettingsSectionOpen(itemsSection, 'items');
  const productsSection = document.querySelector('#page-settings [data-settings-section="products"]');
  if (productsSection) bindSettingsSectionOpen(productsSection, 'products');
  const historySection = document.querySelector('#page-settings [data-settings-section="history"]');
  if (historySection) bindSettingsSectionOpen(historySection, 'history');
  renderProductCatalog();
  renderHistoryList();
  const cloudRoot = document.getElementById('settings-cloud-root');
  if (cloudRoot) {
    cloudRoot.innerHTML = '';
    appendCloudConnectSection(cloudRoot);
  }
  const root = document.getElementById('settings-list');
  if (!root) return;
  root.innerHTML = '';
  appendSettingsSection(root, 'チェック頻度', 'cycle', customCycles.slice(), {
    hint: '月次・週次など、いつ数えるかの区分です。'
  });
  appendSettingsSection(root, '場所', 'place', customPlaces.slice(), {
    hint: '棚卸しのときに回る場所です。↑↓で並び順を変えられます。',
    reorder: true
  });
  appendSettingsSection(root, 'カテゴリ', 'category', allCategories(), {
    hint: '買い物リストのまとめに使います。↑↓で並び順を変えられます。',
    reorder: true
  });
  appendSettingsSection(root, '購入先', 'purchaseDest', allPurchaseDests(), {
    hint: '発注リストのまとめに使います。1つの品を複数の店で買えます。ネット／店舗で発注後の流れが変わります。↑↓で並び順を変えられます。',
    reorder: true,
    nameExtra: name => destKindLabel(name),
    extraAction: (name, row) => {
      const kindBtn = document.createElement('button');
      kindBtn.type = 'button';
      kindBtn.className = 'settings-edit';
      kindBtn.textContent = '種別';
      kindBtn.setAttribute('aria-label', name + 'の種別を変更');
      kindBtn.onclick = () => changePurchaseDestKind(name);
      row.appendChild(kindBtn);
    }
  });
  const danger = document.createElement('div');
  danger.className = 'settings-section';
  const heading = document.createElement('h3');
  heading.textContent = '棚卸しデータ';
  const hint = document.createElement('p');
  hint.className = 'settings-hint';
  hint.textContent = 'アイテム名や場所はそのまま残し、在庫チェックの入力だけを未入力に戻します。';
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
