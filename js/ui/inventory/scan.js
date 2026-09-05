const SCAN_STATUS = {
  needCode: 'コードを入力してください。',
  notFound: 'このバーコードの商品は登録されていません',
  unlinked: 'このバーコードの商品はアイテムに紐づいていません',
  unsupported: 'このブラウザはカメラ読み取りに対応していません。',
  starting: 'カメラを起動しています…',
  ready: 'バーコードを枠に合わせてください。',
  denied: 'カメラの使用が許可されていません。設定からカメラを許可してください。'
};

function scanModalEl() {
  return document.getElementById('scan-modal');
}

function setScanStatus(message, kind) {
  const status = document.getElementById('scan-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('is-error', kind === 'error');
}

function setScanPreviewVisible(visible) {
  const wrap = document.getElementById('scan-preview-wrap');
  if (wrap) wrap.hidden = !visible;
}

function setScanManualVisible(visible) {
  const manual = document.getElementById('scan-manual');
  if (manual) manual.hidden = !visible;
  const inner = document.querySelector('#scan-modal .scan-overlay-inner');
  if (inner) inner.classList.toggle('is-fallback', !!visible);
}

function pickScannedItem(matches) {
  if (matches.length === 1) return matches[0];
  if (typeof isInventoryPlaceDetailView === 'function' && isInventoryPlaceDetailView()) {
    const local = matches.find(match =>
      itemMatchesCyclePlace(match.item, ALL_FILTER, inventoryPlaceFilter)
    );
    if (local) return local;
  }
  return matches[0];
}

function failScannedCode(message) {
  closeInventoryScan();
  alert(message);
  return false;
}

async function handleScannedCode(raw, options) {
  const fromManual = !!(options && options.fromManual);
  const code = normalizeBarcode(raw);
  if (!code) {
    setScanStatus(SCAN_STATUS.needCode, 'error');
    return false;
  }
  if (shouldIgnoreScanCode(code, fromManual)) return false;

  const result = lookupItemsByBarcode(code);
  if (result.status === 'notFound') return failScannedCode(SCAN_STATUS.notFound);
  if (result.status === 'unlinked') return failScannedCode(SCAN_STATUS.unlinked);

  const chosen = pickScannedItem(result.matches);
  if (!chosen) return false;

  closeInventoryScan();
  jumpToInventoryItem(chosen.item);
  return true;
}

function submitInventoryScanCode() {
  const input = document.getElementById('scan-code-input');
  handleScannedCode(input ? input.value : '', { fromManual: true });
}

async function startInventoryScanCamera() {
  setScanPreviewVisible(false);
  setScanManualVisible(false);
  if (!canUseScanCamera()) {
    setScanManualVisible(true);
    setScanStatus(SCAN_STATUS.unsupported, 'error');
    alert(SCAN_STATUS.unsupported);
    return;
  }
  setScanStatus(SCAN_STATUS.starting);
  const result = await startScanCamera(raw => handleScannedCode(raw));
  if (result.ok) {
    setScanPreviewVisible(true);
    setScanStatus(SCAN_STATUS.ready);
    return;
  }
  setScanPreviewVisible(false);
  setScanManualVisible(true);
  const message = result.reason === 'unsupported' ? SCAN_STATUS.unsupported : SCAN_STATUS.denied;
  setScanStatus(message, 'error');
  alert(message);
}

function openInventoryScan() {
  const modal = scanModalEl();
  const input = document.getElementById('scan-code-input');
  if (!modal) return;
  stopScanCamera();
  resetScanCameraMemory();
  if (input) input.value = '';
  setScanStatus('');
  setScanPreviewVisible(false);
  setScanManualVisible(false);
  modal.style.display = 'flex';
  syncBodyScrollLock();
  startInventoryScanCamera();
}

function closeInventoryScan() {
  const modal = scanModalEl();
  stopScanCamera();
  if (modal) modal.style.display = 'none';
  syncBodyScrollLock();
}

function initInventoryScan() {
  const input = document.getElementById('scan-code-input');
  if (input) {
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        submitInventoryScanCode();
      }
    });
  }
  window.addEventListener('pagehide', stopScanCamera);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopScanCamera();
      return;
    }
    if (overlayIsOpen(scanModalEl())) startInventoryScanCamera();
  });
}
