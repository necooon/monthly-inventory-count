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
window.saveAndRender = saveAndRender;
CheckStock.persist = { persistLocalState, saveAndRender, persistAndFlushCloud };
