const PLACE_STATUS_LABELS = {
  complete: '完了',
  'in-progress': '進行中',
  'not-started': '未チェック'
};

function countEnteredProgress(items) {
  const total = items.length;
  const done = items.filter(item => item.entered).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}

function placeBadgeText(status, done, total) {
  return `${done}/${total} ${PLACE_STATUS_LABELS[status]}`;
}

function getPlaceStatus(done, total) {
  if (total === 0) return null;
  if (done === 0) return 'not-started';
  if (done === total) return 'complete';
  return 'in-progress';
}

function inventoryPlaceOrder() {
  const names = customPlaces.filter(Boolean);
  if (!names.includes(UNSET_PLACE_FILTER)) names.push(UNSET_PLACE_FILTER);
  return names;
}

function getPlaceScopeItems(place) {
  return stockItems.filter(item => itemMatchesCyclePlace(item, inventoryCycleFilter, place));
}

function getDetailScopeItems() {
  return stockItems.filter(item => itemMatchesCyclePlace(item, ALL_FILTER, inventoryPlaceFilter));
}

function getPlaceProgress(place) {
  return countEnteredProgress(getPlaceScopeItems(place));
}

function getDashboardPlaces() {
  return inventoryPlaceOrder().filter(place => getPlaceScopeItems(place).length > 0);
}

function overallProgressLabel(percent) {
  return percent >= 100 ? `全体 ${percent}% 完了` : `全体 ${percent}%`;
}

function progressLabel(done, total) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return `${done} / ${total}（${percent}%）`;
}
