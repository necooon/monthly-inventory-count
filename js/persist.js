function persistLocalState() {
  stockItems.forEach(syncItemFlags);
  persistItems(stockItems);
  persistMasters();
  if (applyingRemote) return;
  if (isCloudReady() && !cloudHydrated) return;
  localSyncEpoch += 1;
  if (!skipScheduledCloudSave) scheduleCloudSave();
}

function saveAndRender() {
  persistLocalState();
  renderAll();
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
