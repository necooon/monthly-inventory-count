const SCAN_STATUS = {
  needCode: 'コードを入力してください。',
  notFound: '一致する商品がありません。',
  unsupported: 'カメラ非対応のため、JANコードを入力してください。',
  starting: 'カメラを起動しています…',
  ready: 'バーコードを枠に合わせてください。',
  denied: 'カメラを使えません。JANコードを入力してください。'
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

async function pickScannedItem(matches) {
  if (matches.length === 1) return matches[0];
  setScanCameraPaused(true);
  const pickedId = await showActionChoice(
    '商品を選ぶ',
    '同じバーコードの商品が複数あります。',
    matches.map(match => ({
      label: `${match.item.name}（${match.product.name}）`,
      value: match.item.id
    }))
  );
  setScanCameraPaused(false);
  if (!pickedId) return null;
  return matches.find(match => String(match.item.id) === String(pickedId)) || null;
}

async function handleScannedCode(raw, options) {
  const fromManual = !!(options && options.fromManual);
  const code = normalizeBarcode(raw);
  if (!code) {
    setScanStatus(SCAN_STATUS.needCode, 'error');
    return false;
  }
  if (shouldIgnoreScanCode(code, fromManual)) return false;

  const matches = findItemsByBarcode(code);
  if (!matches.length) {
    setScanStatus(SCAN_STATUS.notFound, 'error');
    return false;
  }

  const chosen = await pickScannedItem(matches);
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
  if (!canUseScanCamera()) {
    setScanStatus(SCAN_STATUS.unsupported);
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
  if (result.reason === 'unsupported') {
    setScanStatus(SCAN_STATUS.unsupported);
    return;
  }
  setScanStatus(SCAN_STATUS.denied, 'error');
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
  modal.style.display = 'flex';
  syncBodyScrollLock();
  startInventoryScanCamera();
  if (input && !isCoarsePointer()) {
    input.focus();
    input.select();
  }
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
