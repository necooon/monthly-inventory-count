const SAVE_STATUS_LABELS = {
  saving: '保存中...',
  saved: '保存済み'
};

let autosaveTimer = null;

function setSaveStatus(status) {
  const el = document.getElementById('save-status');
  if (!el) return;
  const label = SAVE_STATUS_LABELS[status];
  el.hidden = !label;
  el.textContent = label || '';
  el.className = label ? `save-status ${status}` : 'save-status';
}

function clearAutosaveTimer() {
  if (!autosaveTimer) return false;
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  return true;
}

function persistAutosave(options) {
  clearAutosaveTimer();
  if (options && options.render) saveAndRender();
  else persistLocalState();
  setSaveStatus('saved');
}

function scheduleLocalAutosave() {
  setSaveStatus('saving');
  clearAutosaveTimer();
  autosaveTimer = setTimeout(persistAutosave, AUTOSAVE_DELAY_MS);
}

function initLocalAutosave() {
  const flushAll = () => {
    if (autosaveTimer) persistAutosave();
    flushCloudSave({ quiet: true, onlyIfPending: true });
  };
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}
