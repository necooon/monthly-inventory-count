const AUTOSAVE_DELAY_MS = 400;
let autosaveTimer = null;

function persistLocalState() {
  stockItems.forEach(syncItemFlags);
  persistItems(stockItems);
  persistMasters();
  if (applyingRemote) return;
  if (typeof isCloudReady === 'function' && isCloudReady() && !cloudHydrated) return;
  localSyncEpoch += 1;
  if (!skipScheduledCloudSave) scheduleCloudSave();
}

function saveAndRender() {
  persistLocalState();
  renderAll();
}

function setSaveStatus(status) {
  const el = document.getElementById('save-status');
  if (!el) return;
  if (!status) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'save-status';
    return;
  }
  el.hidden = false;
  el.textContent = status === 'saving' ? '保存中...' : '保存済み';
  el.className = 'save-status ' + status;
}

function scheduleLocalAutosave() {
  setSaveStatus('saving');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    persistLocalState();
    setSaveStatus('saved');
  }, AUTOSAVE_DELAY_MS);
}

function cancelLocalAutosave() {
  if (!autosaveTimer) return false;
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  return true;
}

function flushLocalAutosave() {
  if (!cancelLocalAutosave()) return;
  persistLocalState();
  setSaveStatus('saved');
}

function markLocalSaved() {
  cancelLocalAutosave();
  setSaveStatus('saved');
}

function initLocalAutosave() {
  window.addEventListener('pagehide', flushLocalAutosave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLocalAutosave();
  });
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
