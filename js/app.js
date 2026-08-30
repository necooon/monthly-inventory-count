const SUPABASE_CONFIG = {
  url: 'https://dmvznvxczrpbqrzfcqcc.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnpudnhjenJwYnFyemZjcWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NjgxNjUsImV4cCI6MjEwMzU0NDE2NX0.tOPfmnQr5HTPk28H-bvfTIuhLzhjBB33JLeZldxzndM'
};
const HOUSEHOLD_ID = 'personal';
const DEFAULT_CYCLES = ['MONTHLY', 'WEEKLY'];
const DEFAULT_PLACES = ['洗面所', 'キッチン', 'トイレ'];
const DEFAULT_CATEGORIES = ['医薬品', '日用品', '食品・調味料', '水・コーヒー・お茶・飲料'];
const DEFAULT_UNITS = ['個', '本', '袋', '箱', '缶', '瓶', 'パック', 'セット', '巻', 'ロール', '枚', '束', 'ケース', 'kg', 'g', 'L', 'ml', '食', 'チューブ'];
const CATEGORY_PLACE_NAMES = new Set(DEFAULT_CATEGORIES);
const REMOVED_LOCATION = 'その他';
const ALL_FILTER = 'すべて';
const UNSET_PLACE_FILTER = '未選択';
const UNSET_CATEGORY_LABEL = '未分類';
const UNIT_SEP = '::';
const ADD_NEW_VALUE = 'ADD_NEW';
const RENAME_VALUE = 'RENAME';
const DELETE_VALUE = 'DELETE';

let customUnits = loadNameList('stockUnits', DEFAULT_UNITS);

let customCycles = loadNameList('stockCycles', DEFAULT_CYCLES);
let customPlaces = loadNameList('stockPlaces', loadNameList('stockLocations', DEFAULT_PLACES));
customPlaces = customPlaces.filter(loc => loc !== REMOVED_LOCATION && !CATEGORY_PLACE_NAMES.has(loc));
if (customPlaces.length === 0) customPlaces = [...DEFAULT_PLACES];

let customCategories = loadNameList('stockCategories', DEFAULT_CATEGORIES);

let customCheckUnits = loadCheckUnitMaster();
customCheckUnits = customCheckUnits.filter(u => !CATEGORY_PLACE_NAMES.has(u.place));

let inventoryCycleFilter = ALL_FILTER;
let inventoryPlaceFilter = ALL_FILTER;
let inventoryCollapsedPlaces = loadInventoryCollapsedPlaces();
let settingsOpenSections = loadSettingsOpenSections();
let catalogCycleFilter = ALL_FILTER;
let catalogPlaceFilter = ALL_FILTER;
let catalogCategoryFilter = ALL_FILTER;
let orderCategoryFilter = ALL_FILTER;
let currentPage = localStorage.getItem('currentPage') || 'inventory';
let selectedItemId = null;
let editingItemId = null;
let applyingRemote = false;
let supabaseClient = null;
let syncUnsub = null;
let syncTimer = null;
let pullTimer = null;
let cloudPushInProgress = false;
let pullAfterPush = false;
let skipScheduledCloudSave = false;
let localSyncEpoch = 0;
let householdId = HOUSEHOLD_ID;

const APP_TITLE = 'Check＆Stock';
const PAGE_IDS = ['inventory', 'order', 'settings'];
if (currentPage === 'items') currentPage = 'settings';
if (!PAGE_IDS.includes(currentPage)) currentPage = 'inventory';
let inventoryUnenteredOnly = false;
let lastOrderUndo = null;
let undoToastTimer = null;

function loadNameList(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(parsed)) {
      const names = parsed.map(v => String(v).trim()).filter(Boolean);
      if (names.length) return names;
    }
  } catch (e) { /* ignore */ }
  return [...fallback];
}

function unitKey(unit) {
  return unit.cycle + UNIT_SEP + (unit.place || '');
}

function parseUnitKey(key) {
  if (!key || key === ALL_FILTER) return null;
  const idx = String(key).indexOf(UNIT_SEP);
  if (idx < 0) return null;
  const cycle = String(key).slice(0, idx).trim();
  const place = String(key).slice(idx + UNIT_SEP.length).trim();
  if (!cycle) return null;
  return { cycle, place };
}

function placeLabel(place) {
  return place ? place : UNSET_PLACE_FILTER;
}

function normalizeCategory(value) {
  const name = String(value || '').trim();
  if (!name || name === UNSET_CATEGORY_LABEL) return '';
  return name;
}

function collectUniqueNames(primary, extras, normalizeFn) {
  const seen = new Set();
  const names = [];
  const push = (raw) => {
    const name = normalizeFn(raw);
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  primary.forEach(push);
  extras.forEach(push);
  return names;
}

function allCategories() {
  return collectUniqueNames(customCategories, stockItems.map(item => item.category), normalizeCategory);
}

function settingsCategoryNames() {
  return allCategories();
}

function ensureUnit(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  return ensureName(customUnits, trimmed);
}

function defaultUnitName() {
  if (customUnits.includes('個')) return '個';
  return customUnits[0] || DEFAULT_UNITS[0] || '個';
}

function ensureCategory(name) {
  const trimmed = normalizeCategory(name);
  if (!trimmed) return '';
  return ensureName(customCategories, trimmed);
}

function unitsEqual(a, b) {
  return !!(a && b && a.cycle === b.cycle && (a.place || '') === (b.place || ''));
}

function fallbackCycleName() {
  return customCycles[0] || DEFAULT_CYCLES[0];
}

function normalizeUnit(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw.cycle) {
    const cycle = String(raw.cycle).trim();
    const place = String(raw.place || '').trim();
    if (!cycle || place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return null;
    return { cycle, place };
  }
  if (typeof raw === 'string') {
    const parsed = parseUnitKey(raw);
    if (parsed) return parsed;
    const place = raw.trim();
    if (!place || place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return null;
    return { cycle: fallbackCycleName(), place };
  }
  return null;
}

function loadCheckUnitMaster() {
  try {
    const parsed = JSON.parse(localStorage.getItem('stockCheckUnits'));
    if (Array.isArray(parsed) && parsed.length) {
      const units = parsed.map(normalizeUnit).filter(Boolean);
      if (units.length) return dedupeUnits(units);
    }
  } catch (e) { /* ignore */ }
  return customPlaces.map(place => ({ cycle: fallbackCycleName(), place }));
}

function dedupeUnits(units) {
  const seen = new Set();
  const next = [];
  (units || []).forEach(unit => {
    const key = unitKey(unit);
    if (seen.has(key)) return;
    seen.add(key);
    next.push(unit);
  });
  return next;
}

function persistMasters() {
  localStorage.setItem('stockCycles', JSON.stringify(customCycles));
  localStorage.setItem('stockPlaces', JSON.stringify(customPlaces));
  localStorage.setItem('stockLocations', JSON.stringify(customPlaces));
  localStorage.setItem('stockCategories', JSON.stringify(customCategories));
  localStorage.setItem('stockUnits', JSON.stringify(customUnits));
  localStorage.setItem('stockCheckUnits', JSON.stringify(customCheckUnits));
}

function ensureName(list, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  if (!list.includes(trimmed)) list.push(trimmed);
  return trimmed;
}

function ensureCycle(name) {
  return ensureName(customCycles, name);
}

function ensurePlace(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed === REMOVED_LOCATION) return null;
  return ensureName(customPlaces, trimmed);
}

function ensureCheckUnit(cycleName, placeName) {
  const cycle = ensureCycle(cycleName);
  if (!cycle) return null;
  const place = String(placeName || '').trim();
  if (place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return null;
  if (place) ensurePlace(place);
  const unit = { cycle, place };
  if (!customCheckUnits.some(u => unitsEqual(u, unit))) customCheckUnits.push(unit);
  return unit;
}

function rewriteCheckUnits(mapFn) {
  customCheckUnits = dedupeUnits(customCheckUnits.map(mapFn).filter(Boolean));
  stockItems.forEach(item => {
    const next = dedupeUnits((item.checkUnits || []).map(mapFn).filter(Boolean));
    item.checkUnits = next;
    item.location = next[0] ? next[0].place : '';
  });
}

function remapNamedFilter(current, oldName, nextName) {
  if (current !== oldName) return current;
  return nextName || ALL_FILTER;
}

function isReservedPlaceName(name) {
  return name === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(name);
}

const MASTER_KINDS = {
  cycle: {
    addTitle: '新しいチェック頻度の名前を入力してください',
    renameTitle: 'チェック頻度の新しい名前',
    minAlert: 'チェック頻度は1つ以上必要です。',
    deleteExtra: count => count ? `\n${count}件のアイテムからこのチェック頻度が外れます。` : '',
    minList: () => customCycles,
    uniqueNames: () => customCycles,
    moveList: () => customCycles,
    setList: list => { customCycles = list; },
    ensure: name => ensureCycle(name),
    usageCount: name => stockItems.filter(item => itemCheckUnits(item).some(u => u.cycle === name)).length,
    applyRename: (oldName, next) => {
      const idx = customCycles.indexOf(oldName);
      if (idx < 0) return false;
      customCycles[idx] = next;
      rewriteCheckUnits(u => u.cycle === oldName ? { cycle: next, place: u.place } : u);
      inventoryCycleFilter = remapNamedFilter(inventoryCycleFilter, oldName, next);
      catalogCycleFilter = remapNamedFilter(catalogCycleFilter, oldName, next);
      return true;
    },
    applyDelete: name => {
      if (customCycles.length <= 1) return false;
      customCycles = customCycles.filter(v => v !== name);
      rewriteCheckUnits(u => u.cycle === name ? null : u);
      customCheckUnits = customCheckUnits.filter(u => u.cycle !== name);
      inventoryCycleFilter = remapNamedFilter(inventoryCycleFilter, name, ALL_FILTER);
      catalogCycleFilter = remapNamedFilter(catalogCycleFilter, name, ALL_FILTER);
      return true;
    }
  },
  place: {
    addTitle: '新しい場所の名前を入力してください',
    renameTitle: '場所の新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムの場所は未選択になります。` : '',
    uniqueNames: () => customPlaces,
    moveList: () => customPlaces,
    setList: list => { customPlaces = list; },
    ensure: name => ensurePlace(name),
    validate: name => {
      if (!isReservedPlaceName(name)) return true;
      alert('その名前は場所に使えません。');
      return false;
    },
    usageCount: name => stockItems.filter(item => itemCheckUnits(item).some(u => u.place === name)).length,
    applyRename: (oldName, next) => {
      const idx = customPlaces.indexOf(oldName);
      if (idx < 0) return false;
      customPlaces[idx] = next;
      if (inventoryCollapsedPlaces.has(oldName)) {
        inventoryCollapsedPlaces.delete(oldName);
        inventoryCollapsedPlaces.add(next);
        persistInventoryCollapsedPlaces();
      }
      rewriteCheckUnits(u => u.place === oldName ? { cycle: u.cycle, place: next } : u);
      inventoryPlaceFilter = remapNamedFilter(inventoryPlaceFilter, oldName, next);
      catalogPlaceFilter = remapNamedFilter(catalogPlaceFilter, oldName, next);
      return true;
    },
    applyDelete: name => {
      customPlaces = customPlaces.filter(v => v !== name);
      if (inventoryCollapsedPlaces.has(name)) {
        inventoryCollapsedPlaces.delete(name);
        persistInventoryCollapsedPlaces();
      }
      rewriteCheckUnits(u => u.place === name ? { cycle: u.cycle, place: '' } : u);
      customCheckUnits = customCheckUnits.filter(u => u.place !== name);
      inventoryPlaceFilter = remapNamedFilter(inventoryPlaceFilter, name, ALL_FILTER);
      catalogPlaceFilter = remapNamedFilter(catalogPlaceFilter, name, ALL_FILTER);
      return true;
    }
  },
  category: {
    addTitle: '新しいカテゴリの名前を入力してください',
    renameTitle: 'カテゴリの新しい名前',
    deleteExtra: count => count ? `\n${count}件のアイテムは未分類になります。` : '',
    uniqueNames: () => customCategories,
    moveList: () => settingsCategoryNames(),
    setList: list => { customCategories = list; },
    ensure: name => ensureCategory(name),
    usageCount: name => stockItems.filter(item => normalizeCategory(item.category) === name).length,
    applyRename: (oldName, next) => {
      if (!customCategories.includes(oldName)) customCategories.push(oldName);
      const idx = customCategories.indexOf(oldName);
      customCategories[idx] = next;
      stockItems.forEach(item => {
        if (normalizeCategory(item.category) === oldName) item.category = next;
      });
      catalogCategoryFilter = remapNamedFilter(catalogCategoryFilter, oldName, next);
      orderCategoryFilter = remapNamedFilter(orderCategoryFilter, oldName, next);
      return true;
    },
    applyDelete: name => {
      customCategories = customCategories.filter(v => v !== name);
      stockItems.forEach(item => {
        if (normalizeCategory(item.category) === name) item.category = '';
      });
      catalogCategoryFilter = remapNamedFilter(catalogCategoryFilter, name, ALL_FILTER);
      orderCategoryFilter = remapNamedFilter(orderCategoryFilter, name, ALL_FILTER);
      return true;
    }
  },
  unit: {
    addTitle: '新しい単位を入力してください',
    renameTitle: '単位の新しい名前',
    minAlert: '単位は1つ以上必要です。',
    deleteExtra: count => count ? `\n${count}件のアイテムは「${defaultUnitName()}」になります。` : '',
    minList: () => customUnits,
    uniqueNames: () => allUnits(),
    ensure: name => ensureUnit(name),
    usageCount: name => stockItems.filter(item => item.unit === name).length,
    applyRename: (oldName, next) => {
      if (customUnits.includes(oldName)) {
        customUnits[customUnits.indexOf(oldName)] = next;
      } else if (!customUnits.includes(next)) {
        customUnits.push(next);
      }
      stockItems.forEach(item => {
        if (item.unit === oldName) item.unit = next;
      });
      return true;
    },
    applyDelete: name => {
      if (customUnits.length <= 1) return false;
      const fallback = customUnits.find(u => u !== name) || defaultUnitName();
      customUnits = customUnits.filter(v => v !== name);
      stockItems.forEach(item => {
        if (item.unit === name) item.unit = fallback;
      });
      return true;
    }
  }
};

async function addMasterName(kind) {
  const spec = MASTER_KINDS[kind];
  const raw = await showPrompt(spec.addTitle);
  if (!raw || !raw.trim()) return;
  const trimmed = raw.trim();
  if (spec.validate && !spec.validate(trimmed)) return;
  spec.ensure(trimmed);
  await persistAndFlushCloud();
  return trimmed;
}

async function persistAndFlushCloud() {
  skipScheduledCloudSave = true;
  try {
    saveAndRender();
  } finally {
    skipScheduledCloudSave = false;
  }
  await flushCloudSave();
}

async function renameMasterName(kind, oldName) {
  const spec = MASTER_KINDS[kind];
  const raw = await showPrompt(spec.renameTitle, oldName);
  if (!raw || !raw.trim()) return;
  const next = raw.trim();
  if (next === oldName) return;
  if (spec.validate && !spec.validate(next)) return;
  if (spec.uniqueNames().includes(next)) {
    alert('同じ名前がすでにあります。');
    return;
  }
  if (!spec.applyRename(oldName, next)) return;
  await persistAndFlushCloud();
  return next;
}

async function deleteMasterName(kind, name) {
  const spec = MASTER_KINDS[kind];
  const listForMin = spec.minList ? spec.minList() : spec.uniqueNames();
  if (spec.minAlert && listForMin.length <= 1) {
    alert(spec.minAlert);
    return;
  }
  const count = spec.usageCount(name);
  const extra = spec.deleteExtra ? spec.deleteExtra(count) : '';
  if (!confirm(`「${name}」を削除しますか？${extra}`)) return;
  if (!spec.applyDelete(name)) return;
  await persistAndFlushCloud();
  return true;
}

async function moveMasterName(kind, name, delta) {
  const spec = MASTER_KINDS[kind];
  if (!spec || !spec.moveList) return;
  const list = spec.moveList();
  const idx = list.indexOf(name);
  const next = idx + delta;
  if (idx < 0 || next < 0 || next >= list.length) return;
  const swapped = list[idx];
  list[idx] = list[next];
  list[next] = swapped;
  spec.setList(list);
  await persistAndFlushCloud();
}

function loadSettingsOpenSections() {
  try {
    const parsed = JSON.parse(localStorage.getItem('settingsOpenSections'));
    if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  } catch (e) { /* ignore */ }
  return new Set(['items']);
}

function persistSettingsOpenSections() {
  localStorage.setItem('settingsOpenSections', JSON.stringify([...settingsOpenSections]));
}

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

function renderSettings() {
  const itemsSection = document.querySelector('#page-settings [data-settings-section="items"]');
  if (itemsSection) bindSettingsSectionOpen(itemsSection, 'items');
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
  appendSettingsSection(root, 'カテゴリ', 'category', settingsCategoryNames(), {
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

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function formatLastOrder(value) {
  const date = normalizeDate(value);
  if (!date) return '';
  const parts = date.split('-');
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function showPage(page) {
  if (page === 'items') page = 'settings';
  currentPage = page;
  localStorage.setItem('currentPage', page);
  PAGE_IDS.forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('active', p === page);
    const nav = document.getElementById(`nav-${p}`);
    const on = p === page;
    nav.classList.toggle('active', on);
    if (on) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  });
  saveAndRender();
}

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

// データの読み込み
let stockItems = JSON.parse(localStorage.getItem('monthlyStockWithLocation')) || [
  { id: 1, name: 'トイレットペーパー', count: 2, location: 'トイレ', checkUnits: [{ cycle: '月単位', place: 'トイレ' }], target: 4, orderThreshold: 1, unit: '巻', entered: true },
  { id: 2, name: '洗濯洗剤', count: 1, location: '洗面所', checkUnits: [{ cycle: '月単位', place: '洗面所' }], target: 2, orderThreshold: 1, unit: '本', entered: true },
  { id: 3, name: '食器用洗剤', count: 0, location: 'キッチン', checkUnits: [{ cycle: '月単位', place: 'キッチン' }], target: 2, orderThreshold: 0, unit: '本', entered: false }
];

stockItems = stockItems.map(migrateItem);
stockItems.forEach(item => rememberUnit(item.unit));
persistMasters();

// 入力モーダルを表示して入力値を返す（prompt() の代替。IMEでの日本語入力が可能）
let promptResolver = null;

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

// Enter で確定、Escape でキャンセル
document.getElementById('prompt-input').addEventListener('keydown', (e) => {
  // IME変換中の Enter は確定操作なので無視する
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

// モーダルを開く
function openModal() {
  document.getElementById('add-modal').style.display = 'flex';
  const preset = [];
  if (currentPage === 'settings') {
    if (catalogCycleFilter !== ALL_FILTER && catalogPlaceFilter !== ALL_FILTER) {
      preset.push({ cycle: catalogCycleFilter, place: catalogPlaceFilter });
    }
  } else if (inventoryCycleFilter !== ALL_FILTER && inventoryPlaceFilter !== ALL_FILTER) {
    preset.push({ cycle: inventoryCycleFilter, place: inventoryPlaceFilter });
  }
  fillCyclePlacePickers('new-item', preset.length ? preset : (customCheckUnits[0] ? [customCheckUnits[0]] : []));
  fillCategorySelect(document.getElementById('new-item-category'), '');
  fillUnitSelect(document.getElementById('new-item-unit'), '個');
  document.getElementById('new-item-target').value = 1;
  document.getElementById('new-item-threshold').value = 0;
  syncBodyScrollLock();
  document.getElementById('new-item-name').focus();
}

// モーダルを閉じる
function closeModal() {
  document.getElementById('add-modal').style.display = 'none';
  document.getElementById('new-item-name').value = '';
  document.getElementById('new-item-target').value = 1;
  document.getElementById('new-item-threshold').value = 0;
  syncBodyScrollLock();
}

async function addNameFromForm(kind, containerId) {
  const spec = MASTER_KINDS[kind];
  const selected = getSelectedNames(containerId);
  const raw = await showPrompt(spec.addTitle);
  if (!raw || !raw.trim()) return;
  const trimmed = raw.trim();
  if (kind === 'place' && trimmed === REMOVED_LOCATION) {
    alert('「その他」は使えません。具体的な名前を入力してください。');
    return;
  }
  spec.ensure(trimmed);
  persistMasters();
  if (!selected.includes(trimmed)) selected.push(trimmed);
  fillNamePicker(containerId, spec.uniqueNames(), selected);
}

function itemCheckUnits(item) {
  let units = [];
  if (Array.isArray(item.checkUnits)) units = item.checkUnits.map(normalizeUnit).filter(Boolean);
  else if (item.location && !CATEGORY_PLACE_NAMES.has(item.location)) {
    const one = normalizeUnit(item.location);
    if (one) units = [one];
  }
  units = dedupeUnits(units).filter(u => customCheckUnits.some(master => unitsEqual(master, u)));
  return units;
}

function setItemCheckUnits(item, units) {
  const next = dedupeUnits((units || []).map(normalizeUnit).filter(Boolean))
    .filter(u => customCheckUnits.some(master => unitsEqual(master, u)));
  item.checkUnits = next;
  item.location = item.checkUnits[0] ? item.checkUnits[0].place : '';
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
  fillNamePicker(prefix + '-cycles', customCycles, [...new Set(units.map(u => u.cycle).filter(Boolean))]);
  const places = [...new Set(units.map(u => u.place).filter(Boolean))];
  fillPlaceSelect(document.getElementById(prefix + '-places'), places[0] || '');
}

function selectedPlacesFromPrefix(prefix) {
  const select = document.getElementById(prefix + '-places');
  if (!select) return [];
  const value = String(select.value || '').trim();
  if (!value || value === ADD_NEW_VALUE) return [];
  return [value];
}

function unitsFromCyclePlacePickers(prefix) {
  const cycles = getSelectedNames(prefix + '-cycles');
  const places = selectedPlacesFromPrefix(prefix);
  const units = [];
  if (cycles.length && !places.length) {
    cycles.forEach(cycle => {
      const unit = ensureCheckUnit(cycle, '');
      if (unit) units.push(unit);
    });
  } else {
    cycles.forEach(cycle => {
      places.forEach(place => {
        const unit = ensureCheckUnit(cycle, place);
        if (unit) units.push(unit);
      });
    });
  }
  return { cycles, places, units };
}

function refreshCyclePlacePickers(extraSelected) {
  ['new-item', 'edit-item'].forEach(prefix => {
    const selected = unitsFromCyclePlacePickers(prefix).units;
    if (extraSelected && !selected.some(u => unitsEqual(u, extraSelected))) selected.push(extraSelected);
    fillCyclePlacePickers(prefix, selected);
  });
}

function itemFieldsHtml(item, options) {
  const cycles = [...new Set(itemCheckUnits(item).map(u => u.cycle))];
  const places = [...new Set(itemCheckUnits(item).map(u => placeLabel(u.place)))];
  const category = normalizeCategory(item.category) || UNSET_CATEGORY_LABEL;
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
    rows.push(`<div class="item-field"><span class="item-field-label">場所</span><span class="item-location-wrap">${chips(places.length ? places : [UNSET_PLACE_FILTER])}</span></div>`);
  }
  if (!rows.length) return '';
  return `<div class="item-fields">${rows.join('')}</div>`;
}

function allUnits() {
  return collectUniqueNames(customUnits, stockItems.map(item => item.unit), value => String(value || '').trim());
}

function rememberUnit(name) {
  ensureUnit(name);
}

function isUnitActionValue(value) {
  return value === ADD_NEW_VALUE || value === RENAME_VALUE || value === DELETE_VALUE;
}

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

async function addNewUnit() {
  const raw = await showPrompt('新しい単位を入力してください（例：束）');
  if (!raw || raw.trim() === '') return null;
  const trimmed = raw.trim();
  ensureUnit(trimmed);
  persistMasters();
  scheduleCloudSave();
  return trimmed;
}

async function handleUnitSelectChange(select) {
  const previous = select.dataset.currentUnit || '';
  if (select.value === ADD_NEW_VALUE) {
    const added = await addNewUnit();
    fillUnitSelect(select, added || previous || defaultUnitName());
    const other = otherFormSelect(select, 'unit');
    if (other) fillUnitSelect(other, other.dataset.currentUnit || defaultUnitName());
  } else if (select.value === RENAME_VALUE) {
    fillUnitSelect(select, previous);
    if (previous) {
      const next = await renameMasterName('unit', previous);
      const chosen = next || previous;
      fillUnitSelect(select, chosen);
      const other = otherFormSelect(select, 'unit');
      if (other) {
        const otherVal = other.dataset.currentUnit === previous ? chosen : other.dataset.currentUnit;
        fillUnitSelect(other, otherVal || defaultUnitName());
      }
    }
  } else if (select.value === DELETE_VALUE) {
    fillUnitSelect(select, previous);
    if (previous) {
      await deleteMasterName('unit', previous);
      const names = allUnits();
      const chosen = names.includes(previous) ? previous : (names[0] || defaultUnitName());
      fillUnitSelect(select, chosen);
      const other = otherFormSelect(select, 'unit');
      if (other) {
        const otherVal = other.dataset.currentUnit;
        fillUnitSelect(other, names.includes(otherVal) ? otherVal : (names[0] || defaultUnitName()));
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
  const units = allUnits();
  if (selectedValue && !isUnitActionValue(selectedValue) && !units.includes(selectedValue)) {
    units.unshift(selectedValue);
  }
  units.forEach(unit => appendOption(select, unit, unit));
  appendOption(select, ADD_NEW_VALUE, '＋新しい単位を追加...', { bold: true });
  if (units.length) {
    appendOption(select, RENAME_VALUE, 'この単位の名前を変更...', { bold: true });
    appendOption(select, DELETE_VALUE, 'この単位を削除...', { bold: true });
  }
  const chosen = selectedValue && units.includes(selectedValue) ? selectedValue : (units[0] || defaultUnitName());
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

function formatQty(n, unit) {
  return `${n}${unit || '個'}`;
}

function parseNonNeg(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
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
  if (addLabel) appendOption(select, ADD_NEW_VALUE, addLabel, { bold: true });
  const chosen = selectedValue && names.includes(selectedValue) ? selectedValue : emptyValue;
  select.value = chosen;
  if (datasetKey) select.dataset[datasetKey] = select.value;
}

async function handleNamedSelectAdd(select, { promptTitle, previousValue, validate, ensure, fill, syncOther }) {
  if (select.value !== ADD_NEW_VALUE) return false;
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
  persistMasters();
  fill(select, added);
  if (syncOther) syncOther();
  return true;
}

function fillCategorySelect(select, selectedValue) {
  fillNamedSelect(select, {
    names: allCategories(),
    selectedValue: normalizeCategory(selectedValue),
    emptyValue: '',
    emptyLabel: UNSET_CATEGORY_LABEL,
    addLabel: '＋新しいカテゴリを追加...'
  });
}

async function handleCategorySelectChange(select) {
  await handleNamedSelectAdd(select, {
    promptTitle: MASTER_KINDS.category.addTitle,
    previousValue: '',
    ensure: ensureCategory,
    fill: fillCategorySelect
  });
}

function fillPlaceSelect(select, selectedValue) {
  fillNamedSelect(select, {
    names: customPlaces.filter(name => name && name !== REMOVED_LOCATION),
    selectedValue: String(selectedValue || '').trim(),
    emptyValue: '',
    emptyLabel: UNSET_PLACE_FILTER,
    addLabel: '＋新しい場所を追加...',
    datasetKey: 'currentPlace'
  });
}

async function handlePlaceSelectChange(select) {
  if (select.value !== ADD_NEW_VALUE) {
    select.dataset.currentPlace = select.value;
    return;
  }
  await handleNamedSelectAdd(select, {
    promptTitle: MASTER_KINDS.place.addTitle,
    previousValue: select.dataset.currentPlace || '',
    validate: name => {
      if (!isReservedPlaceName(name)) return true;
      alert('その名前は場所に使えません。');
      return false;
    },
    ensure: ensurePlace,
    fill: fillPlaceSelect,
    syncOther: () => {
      const other = otherFormSelect(select, 'places');
      if (!other) return;
      const otherVal = other.value === ADD_NEW_VALUE ? '' : other.value;
      fillPlaceSelect(other, otherVal);
    }
  });
}

function itemMatchesCyclePlace(item, cycleFilter, placeFilter) {
  const units = itemCheckUnits(item);
  if (!units.length) {
    return cycleFilter === ALL_FILTER && (placeFilter === ALL_FILTER || placeFilter === UNSET_PLACE_FILTER);
  }
  return units.some(u =>
    (cycleFilter === ALL_FILTER || u.cycle === cycleFilter) &&
    (placeFilter === ALL_FILTER || (placeFilter === UNSET_PLACE_FILTER ? !u.place : u.place === placeFilter))
  );
}

function itemMatchesCategory(item, categoryFilter) {
  if (categoryFilter === ALL_FILTER) return true;
  const category = normalizeCategory(item.category);
  if (categoryFilter === UNSET_CATEGORY_LABEL) return !category;
  return category === categoryFilter;
}

function getCatalogItems() {
  const items = stockItems.filter(item =>
    itemMatchesCyclePlace(item, catalogCycleFilter, catalogPlaceFilter) &&
    itemMatchesCategory(item, catalogCategoryFilter)
  );
  return items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
}

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

function renderItemsCatalog() {
  const listDiv = document.getElementById('item-catalog-list');
  const filterDiv = document.getElementById('items-filters');
  if (!listDiv || !filterDiv) return;
  filterDiv.innerHTML = '';
  catalogCycleFilter = appendFilterSelect(filterDiv, 'チェック頻度', customCycles, catalogCycleFilter, value => {
    catalogCycleFilter = value;
    saveAndRender();
  });
  catalogCategoryFilter = appendFilterSelect(filterDiv, 'カテゴリ', allCategories(), catalogCategoryFilter, value => {
    catalogCategoryFilter = value;
    saveAndRender();
  });
  catalogPlaceFilter = appendFilterSelect(filterDiv, '場所', [UNSET_PLACE_FILTER, ...customPlaces], catalogPlaceFilter, value => {
    catalogPlaceFilter = value;
    saveAndRender();
  });
  listDiv.innerHTML = '';
  const items = getCatalogItems();
  if (items.length === 0) {
    listDiv.innerHTML = '<div class="empty-message">アイテムがありません。下のボタンから追加してください。チェック頻度と場所は、どこで・どの周期で数えるかを表します。</div>';
    return;
  }
  items.forEach(item => {
    const itemNeedsOrder = needsOrder(item);
    const itemDiv = document.createElement('div');
    itemDiv.className = `item ${itemNeedsOrder ? 'empty' : ''} ${item.complete ? 'complete' : ''} ${String(selectedItemId) === String(item.id) ? 'selected' : ''}`;
    itemDiv.dataset.itemId = item.id;
    const lastOrderText = formatLastOrder(item.lastOrderedOn);
    const stockText = item.entered ? formatQty(item.count, item.unit) : '未入力';
    itemDiv.innerHTML = `
      <div class="item-info">
        <span class="item-name">
          <span class="item-name-text">${item.name}</span>
          ${itemNeedsOrder ? '<span class="order-badge">発注</span>' : ''}
        </span>
        ${itemFieldsHtml(item)}
        <span class="item-meta">在庫: ${stockText}　必要: ${formatQty(item.target, item.unit)}　補充基準: ${formatQty(item.orderThreshold, item.unit)}</span>
        ${lastOrderText ? `<span class="item-last-order">前回発注: ${lastOrderText}</span>` : ''}
      </div>
    `;
    itemDiv.addEventListener('click', () => selectAndEditItem(item.id));
    listDiv.appendChild(itemDiv);
  });
}

function renderFilters() {
  const filterDiv = document.getElementById('location-filters');
  filterDiv.innerHTML = '';
  if (inventoryCycleFilter !== ALL_FILTER && !customCycles.includes(inventoryCycleFilter)) {
    inventoryCycleFilter = ALL_FILTER;
  }
  if (inventoryPlaceFilter !== ALL_FILTER && inventoryPlaceFilter !== UNSET_PLACE_FILTER && !customPlaces.includes(inventoryPlaceFilter)) {
    inventoryPlaceFilter = ALL_FILTER;
  }
  inventoryCycleFilter = appendFilterSelect(filterDiv, 'チェック頻度', customCycles, inventoryCycleFilter, value => {
    inventoryCycleFilter = value;
    saveAndRender();
  });
  inventoryPlaceFilter = appendFilterSelect(filterDiv, '場所', [UNSET_PLACE_FILTER, ...customPlaces], inventoryPlaceFilter, value => {
    inventoryPlaceFilter = value;
    saveAndRender();
  });
  const unentered = document.createElement('label');
  unentered.className = 'filter-check';
  const unenteredInput = document.createElement('input');
  unenteredInput.type = 'checkbox';
  unenteredInput.checked = inventoryUnenteredOnly;
  unenteredInput.onchange = () => {
    inventoryUnenteredOnly = unenteredInput.checked;
    saveAndRender();
  };
  unentered.appendChild(unenteredInput);
  unentered.appendChild(document.createTextNode('未入力だけ表示'));
  filterDiv.appendChild(unentered);
  updateResetLocationButton();
}

function inventoryFilterLabel() {
  const parts = [];
  if (inventoryCycleFilter !== ALL_FILTER) parts.push(inventoryCycleFilter);
  if (inventoryPlaceFilter !== ALL_FILTER) parts.push(inventoryPlaceFilter);
  return parts.join('・');
}

function updateResetLocationButton() {
  const btn = document.getElementById('reset-location-btn');
  const row = document.getElementById('inventory-action-row');
  const label = inventoryFilterLabel();
  const show = !!label;
  btn.hidden = !show;
  btn.textContent = show ? `「${label}」をリセット` : 'リセット';
  if (row) row.hidden = !show;
}

function resetEnteredItems(cycleFilter, placeFilter) {
  const scoped = cycleFilter != null || placeFilter != null;
  const targetItems = scoped
    ? stockItems.filter(item => itemMatchesCyclePlace(item, cycleFilter, placeFilter))
    : stockItems;
  const label = scoped ? inventoryFilterLabel() : '';
  if (targetItems.length === 0) {
    alert(scoped ? 'この条件にはアイテムがありません' : 'リセットするアイテムがありません');
    return;
  }
  const scope = scoped ? `「${label}」を` : 'すべて';
  if (!confirm(`${scope}リセットしますか？\nアイテム名・チェック頻度・場所・必要数はそのまま残し、すべて未入力になります。`)) {
    return;
  }
  targetItems.forEach(item => {
    item.entered = false;
  });
  saveAndRender();
}

function resetAllInventory() {
  resetEnteredItems(null, null);
}

function resetCurrentLocation() {
  if (inventoryCycleFilter === ALL_FILTER && inventoryPlaceFilter === ALL_FILTER) return;
  resetEnteredItems(inventoryCycleFilter, inventoryPlaceFilter);
}

function needsOrder(item) {
  return item.entered && item.count <= item.orderThreshold;
}

function isComplete(item) {
  return item.entered && item.count > item.orderThreshold;
}

function syncItemFlags(item) {
  item.complete = isComplete(item);
}

function initSupabase() {
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    supabaseClient = null;
    return false;
  }
  try {
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return true;
  } catch (e) {
    console.error('Supabase init failed', e);
    supabaseClient = null;
    return false;
  }
}

function isCloudReady() {
  return !!(supabaseClient && householdId);
}

function scheduleCloudSave() {
  if (applyingRemote || skipScheduledCloudSave || !isCloudReady()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToCloud, 400);
}

async function flushCloudSave() {
  if (!isCloudReady()) return true;
  clearTimeout(syncTimer);
  syncTimer = null;
  const ok = await pushToCloud();
  if (!ok) alert('クラウドへの保存に失敗しました。接続を確認してください。');
  return ok;
}

function scheduleCloudPull() {
  if (applyingRemote || !isCloudReady()) return;
  if (cloudPushInProgress) {
    pullAfterPush = true;
    return;
  }
  clearTimeout(pullTimer);
  pullTimer = setTimeout(pullFromCloud, 250);
}

function localCloudSnapshot() {
  return JSON.stringify({
    cycles: customCycles,
    places: customPlaces,
    categories: customCategories,
    units: customUnits,
    checkUnits: customCheckUnits.map(u => ({ cycle: u.cycle, place: u.place })),
    items: stockItems.map(item => ({
      id: String(item.id),
      name: item.name,
      category: normalizeCategory(item.category),
      count: item.count,
      checkUnits: itemCheckUnits(item),
      target: item.target,
      orderThreshold: item.orderThreshold,
      unit: item.unit,
      entered: !!item.entered,
      lastOrderedOn: normalizeDate(item.lastOrderedOn)
    }))
  });
}

function stateFromCloudRows(cycleRows, locRows, checkUnitRows, categoryRows, stockUnitRows, itemRows, memberships) {
  const cycleNames = (cycleRows || []).map(row => row.name).filter(Boolean);
  const cycles = cycleNames.length ? cycleNames : [...DEFAULT_CYCLES];
  const cycleIdToName = Object.fromEntries((cycleRows || []).map(row => [row.id, row.name]));
  const placeNames = (locRows || []).map(loc => loc.name).filter(name => name && name !== REMOVED_LOCATION && !CATEGORY_PLACE_NAMES.has(name));
  const places = placeNames.length ? placeNames : [...DEFAULT_PLACES];
  const locIdToName = Object.fromEntries((locRows || []).map(loc => [loc.id, loc.name]));
  const categoryNames = (categoryRows || []).map(row => row.name).filter(Boolean);
  const categories = categoryNames.length ? categoryNames : [...DEFAULT_CATEGORIES];
  const unitNames = (stockUnitRows || []).map(row => row.name).filter(Boolean);
  const units = unitNames.length ? unitNames : [...DEFAULT_UNITS];
  const unitIdToUnit = {};
  const checkUnits = [];
  (checkUnitRows || []).forEach(row => {
    const cycle = cycleIdToName[row.cycle_id];
    if (!cycle) return;
    const place = row.location_id ? (locIdToName[row.location_id] || '') : '';
    if (place === REMOVED_LOCATION || CATEGORY_PLACE_NAMES.has(place)) return;
    const unit = { cycle, place };
    unitIdToUnit[row.id] = unit;
    if (!checkUnits.some(u => unitsEqual(u, unit))) checkUnits.push(unit);
  });
  const resolvedUnits = checkUnits.length
    ? checkUnits
    : places.map(place => ({ cycle: cycles[0] || DEFAULT_CYCLES[0], place }));
  const unitsByItem = {};
  (memberships || []).forEach(row => {
    const unit = unitIdToUnit[row.check_unit_id];
    if (!unit) return;
    const key = String(row.item_id);
    if (!unitsByItem[key]) unitsByItem[key] = [];
    if (!unitsByItem[key].some(u => unitsEqual(u, unit))) unitsByItem[key].push(unit);
  });
  const items = (itemRows || []).map(row => {
    const key = String(row.id);
    const fromJoin = unitsByItem[key];
    const fallbackPlace = row.location_id ? locIdToName[row.location_id] : '';
    return migrateItem({
      id: isNaN(Number(row.id)) ? row.id : Number(row.id),
      name: row.name,
      category: row.category,
      count: row.count,
      location: fallbackPlace,
      checkUnits: fromJoin && fromJoin.length ? fromJoin : [],
      target: row.target_qty,
      orderThreshold: row.order_threshold,
      unit: row.unit,
      entered: row.entered,
      lastOrderedOn: row.last_ordered_on
    });
  });
  return { cycles, places, categories, units, checkUnits: resolvedUnits, items };
}

async function fetchCloudState() {
  const { data: household, error: householdError } = await supabaseClient
    .from('households')
    .select('id')
    .eq('id', householdId)
    .maybeSingle();
  if (householdError) throw householdError;
  if (!household) return null;

  const { data: cycleRows, error: cycleError } = await supabaseClient
    .from('cycles')
    .select('id,name,sort_order')
    .eq('household_id', householdId)
    .order('sort_order');
  if (cycleError) throw cycleError;

  const { data: locs, error: locError } = await supabaseClient
    .from('locations')
    .select('id,name,sort_order')
    .eq('household_id', householdId)
    .order('sort_order');
  if (locError) throw locError;

  const { data: categoryRows, error: categoryError } = await supabaseClient
    .from('categories')
    .select('id,name,sort_order')
    .eq('household_id', householdId)
    .order('sort_order');
  if (categoryError) throw categoryError;

  const { data: stockUnitRows, error: stockUnitError } = await supabaseClient
    .from('units')
    .select('id,name,sort_order')
    .eq('household_id', householdId)
    .order('sort_order');
  if (stockUnitError) throw stockUnitError;

  const { data: checkUnitRows, error: checkUnitError } = await supabaseClient
    .from('check_units')
    .select('id,cycle_id,location_id,sort_order')
    .eq('household_id', householdId)
    .order('sort_order');
  if (checkUnitError) throw checkUnitError;

  const { data: rows, error: itemError } = await supabaseClient
    .from('items')
    .select('id,name,count,target_qty,order_threshold,unit,entered,location_id,last_ordered_on,category')
    .eq('household_id', householdId);
  if (itemError) throw itemError;

  let memberships = [];
  const { data: membershipRows, error: membershipError } = await supabaseClient
    .from('item_check_units')
    .select('item_id,check_unit_id')
    .eq('household_id', householdId);
  if (!membershipError) memberships = membershipRows || [];

  return stateFromCloudRows(cycleRows, locs, checkUnitRows, categoryRows, stockUnitRows, rows, memberships);
}

function applyFetchedState(state) {
  applyingRemote = true;
  customCycles = state.cycles.length ? state.cycles : [...DEFAULT_CYCLES];
  customPlaces = (state.places.length ? state.places : [...DEFAULT_PLACES]).filter(name => !CATEGORY_PLACE_NAMES.has(name));
  customCheckUnits = (state.checkUnits.length ? state.checkUnits : customPlaces.map(place => ({
    cycle: customCycles[0] || DEFAULT_CYCLES[0],
    place
  }))).filter(u => !CATEGORY_PLACE_NAMES.has(u.place));
  customCategories = (state.categories && state.categories.length ? state.categories : [...DEFAULT_CATEGORIES]);
  customUnits = (state.units && state.units.length ? state.units : [...DEFAULT_UNITS]);
  stockItems = state.items.map(migrateItem);
  stockItems.forEach(item => {
    if (item.category) ensureCategory(item.category);
    if (item.unit) ensureUnit(item.unit);
  });
  persistMasters();
  renderFilters();
  saveAndRender();
  applyingRemote = false;
}

async function upsertNamedRows(table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = await supabaseClient.from(table).upsert(rows, { onConflict });
  if (error) {
    for (const row of rows) {
      const { error: insertError } = await supabaseClient.from(table).insert(row);
      if (insertError && insertError.code !== '23505') throw insertError;
    }
  }
}

async function purgeRemovedCloudMasters(cycleRows, locs, cloudCategories, cloudStockUnits, cloudUnits) {
  const localUnitKeys = new Set(customCheckUnits.map(unitKey));

  const extraUnitIds = (cloudUnits || []).filter(row => {
    const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
    if (!cycle || !customCycles.includes(cycle.name)) return true;
    const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
    if (loc && !customPlaces.includes(loc.name)) return true;
    const place = loc ? loc.name : '';
    return !localUnitKeys.has(unitKey({ cycle: cycle.name, place }));
  }).map(row => row.id);
  if (extraUnitIds.length) {
    await supabaseClient.from('item_check_units').delete().in('check_unit_id', extraUnitIds);
    const { error: unitDeleteError } = await supabaseClient.from('check_units').delete().in('id', extraUnitIds);
    if (unitDeleteError) throw unitDeleteError;
  }

  const extraCycleIds = (cycleRows || [])
    .filter(row => !customCycles.includes(row.name))
    .map(row => row.id);
  if (extraCycleIds.length) {
    const { data: dropUnits } = await supabaseClient
      .from('check_units')
      .select('id')
      .eq('household_id', householdId)
      .in('cycle_id', extraCycleIds);
    const dropUnitIds = (dropUnits || []).map(row => row.id);
    if (dropUnitIds.length) {
      await supabaseClient.from('item_check_units').delete().in('check_unit_id', dropUnitIds);
      await supabaseClient.from('check_units').delete().in('id', dropUnitIds);
    }
    const { error: cycleDeleteError } = await supabaseClient.from('cycles').delete().in('id', extraCycleIds);
    if (cycleDeleteError) throw cycleDeleteError;
  }

  const extraLocIds = (locs || [])
    .filter(loc => !customPlaces.includes(loc.name))
    .map(loc => loc.id);
  if (extraLocIds.length) {
    const { error: itemLocClearError } = await supabaseClient
      .from('items')
      .update({ location_id: null })
      .eq('household_id', householdId)
      .in('location_id', extraLocIds);
    if (itemLocClearError) throw itemLocClearError;
    const { data: locDropUnits } = await supabaseClient
      .from('check_units')
      .select('id')
      .in('location_id', extraLocIds);
    const locDropUnitIds = (locDropUnits || []).map(row => row.id);
    if (locDropUnitIds.length) {
      await supabaseClient.from('item_check_units').delete().in('check_unit_id', locDropUnitIds);
    }
    await supabaseClient.from('check_units').delete().in('location_id', extraLocIds);
    const { error: locDeleteError } = await supabaseClient.from('locations').delete().in('id', extraLocIds);
    if (locDeleteError) throw locDeleteError;
  }

  const extraCategoryIds = (cloudCategories || [])
    .filter(row => !customCategories.includes(row.name))
    .map(row => row.id);
  if (extraCategoryIds.length) {
    const { error: categoryDeleteError } = await supabaseClient.from('categories').delete().in('id', extraCategoryIds);
    if (categoryDeleteError) throw categoryDeleteError;
  }

  const extraStockUnitIds = (cloudStockUnits || [])
    .filter(row => !customUnits.includes(row.name))
    .map(row => row.id);
  if (extraStockUnitIds.length) {
    const { error: stockUnitDeleteError } = await supabaseClient.from('units').delete().in('id', extraStockUnitIds);
    if (stockUnitDeleteError) throw stockUnitDeleteError;
  }
}

async function pushToCloud() {
  if (!isCloudReady()) return false;
  cloudPushInProgress = true;
  try {
    const { error: householdError } = await supabaseClient.from('households').upsert({
      id: householdId,
      updated_at: new Date().toISOString()
    });
    if (householdError) throw householdError;

    const [
      { data: preCycleRows, error: preCycleReadError },
      { data: preLocs, error: preLocReadError },
      { data: preCategories, error: preCategoryReadError },
      { data: preStockUnits, error: preStockUnitReadError },
      { data: preCheckUnits, error: preCheckUnitReadError }
    ] = await Promise.all([
      supabaseClient.from('cycles').select('id,name').eq('household_id', householdId),
      supabaseClient.from('locations').select('id,name').eq('household_id', householdId),
      supabaseClient.from('categories').select('id,name').eq('household_id', householdId),
      supabaseClient.from('units').select('id,name').eq('household_id', householdId),
      supabaseClient.from('check_units').select('id,cycle_id,location_id').eq('household_id', householdId)
    ]);
    if (preCycleReadError) throw preCycleReadError;
    if (preLocReadError) throw preLocReadError;
    if (preCategoryReadError) throw preCategoryReadError;
    if (preStockUnitReadError) throw preStockUnitReadError;
    if (preCheckUnitReadError) throw preCheckUnitReadError;

    await purgeRemovedCloudMasters(preCycleRows, preLocs, preCategories, preStockUnits, preCheckUnits);

    await upsertNamedRows('cycles', customCycles.map((name, index) => ({
      household_id: householdId,
      name,
      sort_order: index
    })), 'household_id,name');

    await upsertNamedRows('locations', customPlaces.map((name, index) => ({
      household_id: householdId,
      name,
      sort_order: index
    })), 'household_id,name');

    await upsertNamedRows('categories', customCategories.map((name, index) => ({
      household_id: householdId,
      name,
      sort_order: index
    })), 'household_id,name');

    await upsertNamedRows('units', customUnits.map((name, index) => ({
      household_id: householdId,
      name,
      sort_order: index
    })), 'household_id,name');

    const { data: cycleRows, error: cycleReadError } = await supabaseClient
      .from('cycles')
      .select('id,name')
      .eq('household_id', householdId);
    if (cycleReadError) throw cycleReadError;
    const cycleNameToId = Object.fromEntries((cycleRows || []).map(row => [row.name, row.id]));

    const { data: locs, error: locReadError } = await supabaseClient
      .from('locations')
      .select('id,name')
      .eq('household_id', householdId);
    if (locReadError) throw locReadError;
    const nameToId = Object.fromEntries((locs || []).map(loc => [loc.name, loc.id]));

    const placedRows = customCheckUnits.map((unit, index) => ({
      household_id: householdId,
      cycle_id: cycleNameToId[unit.cycle],
      location_id: unit.place ? nameToId[unit.place] : null,
      sort_order: index
    })).filter(row => row.cycle_id && row.location_id);
    await upsertNamedRows('check_units', placedRows, 'household_id,cycle_id,location_id');

    for (const unit of customCheckUnits.filter(u => u.cycle && !u.place)) {
      const cycleId = cycleNameToId[unit.cycle];
      if (!cycleId) continue;
      const { data: existingNull } = await supabaseClient
        .from('check_units')
        .select('id')
        .eq('household_id', householdId)
        .eq('cycle_id', cycleId)
        .is('location_id', null)
        .maybeSingle();
      if (!existingNull) {
        const { error: nullInsertError } = await supabaseClient.from('check_units').insert({
          household_id: householdId,
          cycle_id: cycleId,
          location_id: null,
          sort_order: 0
        });
        if (nullInsertError && nullInsertError.code !== '23505') throw nullInsertError;
      }
    }

    const { data: cloudUnits, error: unitReadError } = await supabaseClient
      .from('check_units')
      .select('id,cycle_id,location_id')
      .eq('household_id', householdId);
    if (unitReadError) throw unitReadError;
    const unitKeyToId = {};
    (cloudUnits || []).forEach(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle) return;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      const place = loc ? loc.name : '';
      unitKeyToId[unitKey({ cycle: cycle.name, place })] = row.id;
    });

    const itemRows = stockItems.map(item => {
      const units = itemCheckUnits(item);
      const firstPlaced = units.find(u => u.place);
      return {
        id: String(item.id),
        household_id: householdId,
        location_id: (firstPlaced && nameToId[firstPlaced.place]) || null,
        category: normalizeCategory(item.category),
        name: item.name,
        count: item.count,
        target_qty: item.target,
        order_threshold: item.orderThreshold,
        unit: item.unit || '個',
        entered: !!item.entered,
        last_ordered_on: normalizeDate(item.lastOrderedOn),
        updated_at: new Date().toISOString()
      };
    });
    if (itemRows.length) {
      const { error: itemUpsertError } = await supabaseClient
        .from('items')
        .upsert(itemRows, { onConflict: 'id' });
      if (itemUpsertError) throw itemUpsertError;
    }

    const { data: cloudItems, error: itemReadError } = await supabaseClient
      .from('items')
      .select('id')
      .eq('household_id', householdId);
    if (itemReadError) throw itemReadError;
    const localIds = new Set(stockItems.map(item => String(item.id)));
    const extraItemIds = (cloudItems || []).map(row => row.id).filter(id => !localIds.has(String(id)));

    const membershipRows = [];
    stockItems.forEach(item => {
      itemCheckUnits(item).forEach(unit => {
        const checkUnitId = unitKeyToId[unitKey(unit)];
        if (!checkUnitId) return;
        membershipRows.push({
          item_id: String(item.id),
          check_unit_id: checkUnitId,
          household_id: householdId
        });
      });
    });
    const { error: membershipClearError } = await supabaseClient
      .from('item_check_units')
      .delete()
      .eq('household_id', householdId);
    if (membershipClearError && membershipClearError.code !== '42P01' && membershipClearError.code !== 'PGRST205') {
      throw membershipClearError;
    }
    if (!membershipClearError && membershipRows.length) {
      const { error: membershipInsertError } = await supabaseClient
        .from('item_check_units')
        .insert(membershipRows);
      if (membershipInsertError) throw membershipInsertError;
    }
    if (extraItemIds.length) {
      const { error: itemDeleteError } = await supabaseClient.from('items').delete().in('id', extraItemIds);
      if (itemDeleteError) throw itemDeleteError;
    }

    const localUnitKeys = new Set(customCheckUnits.map(unitKey));
    const extraUnitIds = (cloudUnits || []).filter(row => {
      const cycle = (cycleRows || []).find(c => c.id === row.cycle_id);
      if (!cycle || !customCycles.includes(cycle.name)) return true;
      const loc = row.location_id ? (locs || []).find(l => l.id === row.location_id) : null;
      if (loc && !customPlaces.includes(loc.name)) return true;
      const place = loc ? loc.name : '';
      return !localUnitKeys.has(unitKey({ cycle: cycle.name, place }));
    }).map(row => row.id);
    if (extraUnitIds.length) {
      await supabaseClient.from('item_check_units').delete().in('check_unit_id', extraUnitIds);
      const { error: unitDeleteError } = await supabaseClient.from('check_units').delete().in('id', extraUnitIds);
      if (unitDeleteError) throw unitDeleteError;
    }

    return true;
  } catch (e) {
    console.error('cloud save failed', e);
    return false;
  } finally {
    cloudPushInProgress = false;
    if (pullAfterPush) {
      pullAfterPush = false;
      scheduleCloudPull();
    }
  }
}

async function pullFromCloud() {
  if (!isCloudReady()) return;
  const epoch = localSyncEpoch;
  try {
    const state = await fetchCloudState();
    if (epoch !== localSyncEpoch) return;
    if (!state) {
      await pushToCloud();
      return;
    }
    const remoteSnap = JSON.stringify({
      cycles: state.cycles,
      places: state.places,
      categories: state.categories,
      units: state.units,
      checkUnits: state.checkUnits.map(u => ({ cycle: u.cycle, place: u.place })),
      items: state.items.map(item => ({
        id: String(item.id),
        name: item.name,
        category: normalizeCategory(item.category),
        count: item.count,
        checkUnits: itemCheckUnits(item),
        target: item.target,
        orderThreshold: item.orderThreshold,
        unit: item.unit,
        entered: !!item.entered,
        lastOrderedOn: normalizeDate(item.lastOrderedOn)
      }))
    });
    if (remoteSnap === localCloudSnapshot()) {
      return;
    }
    if (epoch !== localSyncEpoch) return;
    applyFetchedState(state);
  } catch (e) {
    console.error('cloud load failed', e);
  }
}

function migrateItem(item) {
  const next = { ...item };
  if (next.target === undefined) next.target = 1;
  if (next.entered === undefined) next.entered = true;
  if (next.unit === undefined) next.unit = '個';
  if (next.orderThreshold === undefined) next.orderThreshold = Math.max(0, next.target - 1);
  next.lastOrderedOn = normalizeDate(next.lastOrderedOn);
  let categoryFromPlaces = '';
  let units = [];
  const rawUnits = Array.isArray(next.checkUnits) ? next.checkUnits : [];
  rawUnits.forEach(raw => {
    const place = raw && typeof raw === 'object' ? String(raw.place || '').trim() : '';
    const cycle = raw && typeof raw === 'object' ? String(raw.cycle || '').trim() : '';
    if (CATEGORY_PLACE_NAMES.has(place)) {
      if (!categoryFromPlaces) categoryFromPlaces = place;
      if (cycle) units.push({ cycle, place: '' });
      return;
    }
    const normalized = normalizeUnit(raw);
    if (normalized) units.push(normalized);
  });
  if (!Array.isArray(item.checkUnits) && next.location && !CATEGORY_PLACE_NAMES.has(next.location)) {
    const one = normalizeUnit(next.location);
    if (one) units = [one];
  }
  if (CATEGORY_PLACE_NAMES.has(String(next.location || '').trim()) && !categoryFromPlaces) {
    categoryFromPlaces = String(next.location).trim();
  }
  next.category = normalizeCategory(next.category) || categoryFromPlaces;
  if (next.category) ensureCategory(next.category);
  units = dedupeUnits(units);
  units.forEach(u => ensureCheckUnit(u.cycle, u.place));
  next.checkUnits = units;
  next.location = units[0] ? units[0].place : '';
  next.complete = !!(next.entered && next.count > next.orderThreshold);
  return next;
}

async function startCloudListener() {
  if (syncUnsub) {
    syncUnsub();
    syncUnsub = null;
  }
  if (!isCloudReady()) {
    return;
  }

  await pullFromCloud();

  const channel = supabaseClient
    .channel('household-' + householdId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'items', filter: 'household_id=eq.' + householdId },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'locations', filter: 'household_id=eq.' + householdId },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'item_check_units', filter: 'household_id=eq.' + householdId },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cycles', filter: 'household_id=eq.' + householdId },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_units', filter: 'household_id=eq.' + householdId },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories', filter: 'household_id=eq.' + householdId },
      () => { scheduleCloudPull(); }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'units', filter: 'household_id=eq.' + householdId },
      () => { scheduleCloudPull(); }
    )
    .subscribe();

  syncUnsub = () => {
    supabaseClient.removeChannel(channel);
  };
}

function getScopeItems() {
  return stockItems.filter(item => itemMatchesCyclePlace(item, inventoryCycleFilter, inventoryPlaceFilter));
}

function getFilteredItems() {
  const items = getScopeItems();
  return inventoryUnenteredOnly ? items.filter(item => !item.entered) : items;
}

function placeSortIndex(place) {
  const order = inventoryPlaceOrder();
  const i = order.indexOf(place);
  return i < 0 ? 999 : i;
}

function primaryCountPlace(item) {
  const places = inventoryPlacesForItem(item);
  return places.slice().sort((a, b) => placeSortIndex(a) - placeSortIndex(b) || a.localeCompare(b, 'ja'))[0];
}

function updatePageTitle() {
  const titleEl = document.getElementById('page-title');
  if (!titleEl) return;
  if (currentPage !== 'inventory') {
    titleEl.textContent = APP_TITLE;
    document.title = APP_TITLE;
    return;
  }
  const items = getScopeItems();
  const remaining = items.filter(item => !item.entered).length;
  const place = inventoryPlaceFilter !== ALL_FILTER ? placeLabel(inventoryPlaceFilter === UNSET_PLACE_FILTER ? '' : inventoryPlaceFilter) : '';
  const rest = remaining === 0 ? '完了' : `未入力 ${remaining}`;
  const text = place ? `${place} · ${rest}` : rest;
  titleEl.textContent = text;
  document.title = text;
}

function updateInventoryProgress() {
  const wrap = document.getElementById('inventory-progress');
  const label = document.getElementById('inventory-progress-label');
  const fill = document.getElementById('inventory-progress-fill');
  updatePageTitle();
  if (!wrap || !label || !fill) return;
  const items = getScopeItems();
  if (!items.length) {
    wrap.hidden = true;
    return;
  }
  const done = items.filter(item => item.entered).length;
  const remaining = items.length - done;
  wrap.hidden = false;
  label.textContent = inventoryUnenteredOnly
    ? (remaining === 0 ? '未入力はありません' : `残り ${remaining} 件`)
    : `${done} / ${items.length} 件入力済み`;
  fill.style.width = `${Math.round((done / items.length) * 100)}%`;
}

function inventoryPlacesForItem(item) {
  const units = itemCheckUnits(item).filter(u =>
    (inventoryCycleFilter === ALL_FILTER || u.cycle === inventoryCycleFilter) &&
    (inventoryPlaceFilter === ALL_FILTER ||
      (inventoryPlaceFilter === UNSET_PLACE_FILTER ? !u.place : u.place === inventoryPlaceFilter))
  );
  const places = [...new Set(units.map(u => u.place ? u.place : UNSET_PLACE_FILTER))];
  return places.length ? places : [UNSET_PLACE_FILTER];
}

function inventoryPlaceOrder() {
  const names = customPlaces.filter(Boolean);
  if (!names.includes(UNSET_PLACE_FILTER)) names.push(UNSET_PLACE_FILTER);
  return names;
}

function loadInventoryCollapsedPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem('inventoryCollapsedPlaces'));
    if (Array.isArray(parsed)) return new Set(parsed.map(v => String(v)));
  } catch (e) { /* ignore */ }
  return new Set();
}

function persistInventoryCollapsedPlaces() {
  localStorage.setItem('inventoryCollapsedPlaces', JSON.stringify([...inventoryCollapsedPlaces]));
}

function toggleInventoryPlaceGroup(place) {
  if (inventoryCollapsedPlaces.has(place)) inventoryCollapsedPlaces.delete(place);
  else inventoryCollapsedPlaces.add(place);
  persistInventoryCollapsedPlaces();
  saveAndRender();
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
  const input = Array.from(document.querySelectorAll('#stock-list .count-input'))
    .find(el => String(el.dataset.itemId) === target);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus();
  input.select();
}

function persistLocalState() {
  stockItems.forEach(syncItemFlags);
  localStorage.setItem('monthlyStockWithLocation', JSON.stringify(stockItems));
  persistMasters();
  if (!applyingRemote) {
    localSyncEpoch += 1;
    if (!skipScheduledCloudSave) scheduleCloudSave();
  }
}

function renderInventory() {
  const listDiv = document.getElementById('stock-list');
  if (!listDiv) return;
  listDiv.innerHTML = '';

  const filteredItems = getFilteredItems();
  const groups = new Map();
  filteredItems.forEach(item => {
    inventoryPlacesForItem(item).forEach(place => {
      if (!groups.has(place)) groups.set(place, []);
      groups.get(place).push(item);
    });
  });
  const placeOrder = inventoryPlaceOrder();
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = placeOrder.indexOf(a);
    const ib = placeOrder.indexOf(b);
    const sa = ia < 0 ? 999 : ia;
    const sb = ib < 0 ? 999 : ib;
    return sa - sb || a.localeCompare(b, 'ja');
  });

  if (filteredItems.length === 0) {
    listDiv.innerHTML = inventoryUnenteredOnly
      ? '<div class="empty-message">未入力のアイテムはありません。</div>'
      : '<div class="empty-message">この条件のアイテムはありません。設定のアイテムから追加してください。</div>';
    return;
  }

  keys.forEach(place => {
    const placeItems = groups.get(place).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
    const collapsed = inventoryCollapsedPlaces.has(place);
    const group = document.createElement('div');
    group.className = `order-group${collapsed ? ' collapsed' : ''}`;
    group.dataset.place = place;
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'order-group-title';
    title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    title.innerHTML = `<span class="order-group-chevron" aria-hidden="true">${collapsed ? '▶' : '▼'}</span><span>${place}</span><span class="order-group-count">${placeItems.length}件</span>`;
    title.onclick = () => toggleInventoryPlaceGroup(place);
    group.appendChild(title);
    const body = document.createElement('div');
    body.className = 'order-group-items';
    placeItems.forEach(item => {
      const itemNeedsOrder = needsOrder(item);
      const itemDiv = document.createElement('div');
      itemDiv.className = `item inventory-item ${itemNeedsOrder ? 'empty' : ''} ${item.complete ? 'complete' : ''} ${String(selectedItemId) === String(item.id) ? 'selected' : ''}`;
      itemDiv.dataset.itemId = item.id;
      const countDisplay = item.entered ? String(item.count) : '';
      const showCount = primaryCountPlace(item) === place;
      const minusDisabled = item.entered && item.count <= 0;
      const countControls = showCount ? `
                  <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1減らす" ${minusDisabled ? 'disabled' : ''} onclick="adjustCount(event, this.dataset.itemId, -1)">−</button>
                  <input type="text" class="count-input${item.entered ? '' : ' unentered'}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="${item.name}の在庫数" placeholder="未入力" value="${countDisplay}" data-item-id="${item.id}" onfocus="this.select()" oninput="filterCountInput(this)" onchange="updateCountDirect(this.dataset.itemId, this.value)" onkeydown="handleCountKey(event)">
                  <button type="button" class="count-step" data-item-id="${item.id}" aria-label="${item.name}の在庫を1増やす" onclick="adjustCount(event, this.dataset.itemId, 1)">＋</button>
                  <span class="unit-suffix">${item.unit}</span>` : `<span class="count-shared-note">「${primaryCountPlace(item)}」で入力${item.entered ? ` · ${formatQty(item.count, item.unit)}` : ' · 未入力'}</span>`;
      itemDiv.innerHTML = `
        <div class="inventory-line">
          <button type="button" class="item-edit-btn" data-item-id="${item.id}" aria-label="${item.name}を編集" onclick="selectAndEditItem(this.dataset.itemId)">⋯</button>
          <span class="item-name">
            <span class="item-name-text">${item.name}</span>
          </span>
          <div class="inventory-count">${countControls}</div>
        </div>
      `;
      body.appendChild(itemDiv);
    });
    group.appendChild(body);
    listDiv.appendChild(group);
  });
}

function renderAll() {
  renderInventory();
  renderOrderList();
  renderItemsCatalog();
  renderSettings();
  updateResetLocationButton();
  updateInventoryProgress();
}

function saveAndRender() {
  persistLocalState();
  renderAll();
}

// 発注リストを描画する関数
function renderOrderList() {
  const orderDiv = document.getElementById('order-list');
  const filterDiv = document.getElementById('order-filters');
  orderDiv.innerHTML = '';
  if (filterDiv) {
    filterDiv.innerHTML = '';
    orderCategoryFilter = appendFilterSelect(filterDiv, 'カテゴリ', allCategories(), orderCategoryFilter, value => {
      orderCategoryFilter = value;
      saveAndRender();
    });
  }

  const itemsToOrder = stockItems.filter(item => needsOrder(item) && itemMatchesCategory(item, orderCategoryFilter));

  if (itemsToOrder.length === 0) {
    orderDiv.innerHTML = '<div class="empty-message">発注が必要なアイテムはありません 🎉</div>';
    return;
  }

  const groups = new Map();
  itemsToOrder.forEach(item => {
    const key = normalizeCategory(item.category) || UNSET_CATEGORY_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const categoryOrder = [...allCategories(), UNSET_CATEGORY_LABEL];
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    const sa = ia < 0 ? 999 : ia;
    const sb = ib < 0 ? 999 : ib;
    return sa - sb || a.localeCompare(b, 'ja');
  });

  keys.forEach(key => {
    const group = document.createElement('div');
    group.className = 'order-group';
    const title = document.createElement('div');
    title.className = 'order-group-title';
    title.textContent = key;
    group.appendChild(title);
    groups.get(key).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja')).forEach(item => {
      const orderAmount = Math.max(0, item.target - item.count);
      const itemDiv = document.createElement('div');
      itemDiv.className = 'item empty order-item';
      const lastOrder = formatLastOrder(item.lastOrderedOn);
      itemDiv.innerHTML = `
        <div class="item-info">
          <span class="item-name"><span class="item-name-text">${item.name}</span></span>
          <span class="item-last-order">前回発注: ${lastOrder || 'なし'}</span>
          <span class="order-amount">買う数: ${formatQty(orderAmount, item.unit)}（現在: ${formatQty(item.count, item.unit)} / 必要: ${formatQty(item.target, item.unit)}）</span>
        </div>
        <div class="controls">
          <label class="order-check-label">
            <input type="checkbox" class="order-check" data-item-id="${item.id}" onchange="markAsOrdered(this.dataset.itemId)">
            発注済み
          </label>
        </div>
      `;
      group.appendChild(itemDiv);
    });
    orderDiv.appendChild(group);
  });
}

// 発注済みにして在庫を必要数まで補充する関数
function hideUndoToast() {
  const toast = document.getElementById('undo-toast');
  if (toast) toast.classList.remove('open');
  if (undoToastTimer) {
    clearTimeout(undoToastTimer);
    undoToastTimer = null;
  }
}

function showUndoToast(message) {
  const toast = document.getElementById('undo-toast');
  const text = document.getElementById('undo-toast-text');
  if (!toast || !text) return;
  text.textContent = message;
  toast.classList.add('open');
  if (undoToastTimer) clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(() => {
    lastOrderUndo = null;
    hideUndoToast();
  }, 8000);
}

function markAsOrdered(id) {
  const item = findItemById(id);
  if (!item) return;
  lastOrderUndo = {
    id: item.id,
    count: item.count,
    entered: item.entered,
    lastOrderedOn: item.lastOrderedOn
  };
  item.count = item.target;
  item.entered = true;
  item.lastOrderedOn = todayIsoDate();
  saveAndRender();
  showUndoToast(`「${item.name}」を発注済みにしました`);
}

function undoLastOrder() {
  if (!lastOrderUndo) return;
  const item = findItemById(lastOrderUndo.id);
  if (item) {
    item.count = lastOrderUndo.count;
    item.entered = lastOrderUndo.entered;
    item.lastOrderedOn = lastOrderUndo.lastOrderedOn;
  }
  lastOrderUndo = null;
  hideUndoToast();
  saveAndRender();
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
  fillCyclePlacePickers('edit-item', itemCheckUnits(item));
  syncUnitReadouts();
  document.getElementById('edit-modal').style.display = 'flex';
  syncBodyScrollLock();
  document.getElementById('edit-item-name').focus();
  document.getElementById('edit-item-name').select();
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  editingItemId = null;
  syncBodyScrollLock();
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
  const category = normalizeCategory(document.getElementById(prefix + '-category').value);
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
  rememberUnit(fields.unit);
  persistMasters();
  item.name = fields.name;
  item.category = fields.category;
  if (item.category) ensureCategory(item.category);
  item.unit = fields.unit;
  item.target = fields.target;
  item.orderThreshold = fields.orderThreshold;
  setItemCheckUnits(item, fields.picked.units);
}

function saveItemEdit() {
  const item = findItemById(editingItemId);
  if (!item) return;
  const fields = readItemForm('edit-item');
  if (!fields) return;
  applyFormToItem(item, fields);
  closeEditModal();
  saveAndRender();
}

function deleteEditingItem() {
  if (editingItemId) deleteItem(editingItemId);
}

function findItemById(id) {
  const key = String(id);
  return stockItems.find(i => String(i.id) === key);
}

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

// 数量を直接入力して変更する関数
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
  const item = findItemById(id);
  if (!item) return;
  const trimmed = String(value).trim();
  let moveToUnentered = false;
  if (trimmed === '') {
    item.count = 0;
    item.entered = false;
  } else {
    const newCount = parseInt(trimmed, 10);
    if (isNaN(newCount)) return;
    item.count = newCount < 0 ? 0 : newCount;
    item.entered = true;
    moveToUnentered = true;
  }
  const jump = moveToUnentered && !(options && options.keepFocus);
  const nextId = jump ? nextUnenteredIdAfter(id) : null;
  saveAndRender();
  if (nextId != null) {
    requestAnimationFrame(() => focusCountInput(nextId));
  }
}

// アイテムを追加する関数
function addItem() {
  const fields = readItemForm('new-item');
  if (!fields) return;
  const item = {
    id: Date.now(),
    count: 0,
    entered: false,
    lastOrderedOn: null
  };
  applyFormToItem(item, fields);
  stockItems.push(item);
  closeModal();
  saveAndRender();
}

// アイテムを削除する関数
async function deleteItem(id) {
  if (!confirm('このアイテムを削除しますか？')) return;
  const key = String(id);
  stockItems = stockItems.filter(i => String(i.id) !== key);
  selectedItemId = null;
  closeEditModal();
  await persistAndFlushCloud();
}

// 初回読み込み時の処理
mountItemForms();
initSupabase();
startCloudListener();
renderFilters();
showPage(currentPage);

// AIアドバイスを取得する関数
async function getAIAdvice() {
  const resultDiv = document.getElementById('ai-result');
  const loadingSpinner = document.getElementById('ai-loading');
  
  const itemsToOrder = stockItems.filter(needsOrder);
  
  if (itemsToOrder.length === 0) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '現在、発注が必要なアイテムはありません。素晴らしい管理状態です！';
    return;
  }

  // APIに送信するプロンプトの作成
  const itemListText = itemsToOrder.map(item => `- [${normalizeCategory(item.category) || UNSET_CATEGORY_LABEL}] ${item.name} (必要数: ${formatQty(item.target, item.unit)}, 現在数: ${formatQty(item.count, item.unit)}, 補充基準: ${formatQty(item.orderThreshold, item.unit)}, 不足分: ${formatQty(item.target - item.count, item.unit)})`).join('\n');
  const prompt = `私は家庭の在庫管理をしています。現在、以下のアイテムが不足しており、購入が必要です。カテゴリ（医薬品・日用品・食品など）ごとにまとめて買い物できると助かります。
  
${itemListText}

これらのアイテムを効率的、あるいはお得に購入するためのアドバイス（例えば、まとめ買いの目安、代替品、ドラッグストアやオンラインショップでの購入のコツなど）を、簡潔に3つほど教えてください。`;

  // UIをローディング状態にする
  loadingSpinner.style.display = 'inline-block';
  resultDiv.style.display = 'none';

  const apiKey = ""; // API key will be provided by Canvas runtime
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [{ text: "あなたは主婦・主夫の味方である、親切で賢い家事アドバイザーです。簡潔で分かりやすい言葉で回答してください。HTMLタグ(<b>, <ul>, <li>など)を使って読みやすく装飾してください。" }]
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0) {
      const aiText = data.candidates[0].content.parts[0].text;
      resultDiv.innerHTML = aiText;
    } else {
      resultDiv.innerHTML = '申し訳ありません、アドバイスの取得に失敗しました。';
    }
  } catch (error) {
    console.error('Error fetching AI advice:', error);
    resultDiv.innerHTML = 'エラーが発生しました。時間を置いて再度お試しください。';
  } finally {
    // ローディング状態を解除
    loadingSpinner.style.display = 'none';
    resultDiv.style.display = 'block';
  }
}
