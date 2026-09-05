const SCAN_DEBOUNCE_MS = 1500;
const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let scanStream = null;
let scanRaf = 0;
let scanDetector = null;
let scanPaused = false;
let lastScanCode = '';
let lastScanAt = 0;

function scanModalEl() {
  return document.getElementById('scan-modal');
}

function scanPreviewWrapEl() {
  return document.getElementById('scan-preview-wrap');
}

function scanPreviewEl() {
  return document.getElementById('scan-preview');
}

function scanStatusEl() {
  return document.getElementById('scan-status');
}

function scanCodeInputEl() {
  return document.getElementById('scan-code-input');
}

function setScanStatus(message, kind) {
  const status = scanStatusEl();
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('is-error', kind === 'error');
}

function hideScanPreview() {
  const wrap = scanPreviewWrapEl();
  if (wrap) wrap.hidden = true;
}

function showScanPreview() {
  const wrap = scanPreviewWrapEl();
  if (wrap) wrap.hidden = false;
}

function canUseScanCamera() {
  return typeof window.BarcodeDetector === 'function'
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

async function createScanDetector() {
  if (typeof BarcodeDetector.getSupportedFormats === 'function') {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = SCAN_FORMATS.filter(format => supported.includes(format));
    if (formats.length) return new BarcodeDetector({ formats });
  }
  try {
    return new BarcodeDetector({ formats: SCAN_FORMATS });
  } catch (err) {
    return new BarcodeDetector();
  }
}

function stopScanCamera() {
  if (scanRaf) {
    cancelAnimationFrame(scanRaf);
    scanRaf = 0;
  }
  scanDetector = null;
  scanPaused = false;
  if (scanStream) {
    scanStream.getTracks().forEach(track => track.stop());
    scanStream = null;
  }
  const video = scanPreviewEl();
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  hideScanPreview();
}

function itemsForScannedBarcode(code) {
  const seen = new Set();
  const matches = [];
  findProductsByBarcode(code).forEach(product => {
    if (!product.itemId) return;
    const item = findItemById(product.itemId);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    matches.push({ item, product });
  });
  return matches;
}

function jumpToInventoryItem(item) {
  const place = placeLabel((itemCheckUnits(item)[0] || {}).place);
  inventoryPlaceFilter = place;
  inventoryCycleFilter = ALL_FILTER;
  clearInventorySearch();
  if (currentPage !== 'inventory') showPage('inventory');
  else saveAndRender();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => focusCountInput(item.id));
  });
}

async function pickScannedItem(matches) {
  if (matches.length === 1) return matches[0];
  scanPaused = true;
  const pickedId = await showActionChoice(
    '商品を選ぶ',
    '同じバーコードの商品が複数あります。',
    matches.map(match => ({
      label: `${match.item.name}（${match.product.name}）`,
      value: match.item.id
    }))
  );
  scanPaused = false;
  if (!pickedId) return null;
  return matches.find(match => String(match.item.id) === String(pickedId)) || null;
}

async function handleScannedCode(raw, options) {
  const fromManual = !!(options && options.fromManual);
  const code = normalizeBarcode(raw);
  if (!code) {
    setScanStatus('コードを入力してください。', 'error');
    return false;
  }

  const now = Date.now();
  if (!fromManual && code === lastScanCode && now - lastScanAt < SCAN_DEBOUNCE_MS) return false;
  lastScanCode = code;
  lastScanAt = now;

  const matches = itemsForScannedBarcode(code);
  if (!matches.length) {
    setScanStatus('一致する商品がありません。', 'error');
    return false;
  }

  const chosen = await pickScannedItem(matches);
  if (!chosen) return false;

  closeInventoryScan();
  jumpToInventoryItem(chosen.item);
  return true;
}

function submitInventoryScanCode() {
  const input = scanCodeInputEl();
  handleScannedCode(input ? input.value : '', { fromManual: true });
}

async function scanDetectFrame() {
  if (!scanDetector || !scanStream || scanPaused) return;
  const video = scanPreviewEl();
  if (!video || video.readyState < 2) return;
  try {
    const codes = await scanDetector.detect(video);
    const raw = codes && codes[0] && codes[0].rawValue;
    if (raw) await handleScannedCode(raw);
  } catch (err) {
    /* keep scanning */
  }
}

function scanLoop() {
  if (!scanStream) return;
  scanRaf = requestAnimationFrame(async () => {
    await scanDetectFrame();
    if (scanStream) scanLoop();
  });
}

async function startScanCamera() {
  if (!canUseScanCamera()) {
    hideScanPreview();
    setScanStatus('カメラ非対応のため、JANコードを入力してください。');
    return;
  }

  setScanStatus('カメラを起動しています…');
  try {
    scanDetector = await createScanDetector();
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    const video = scanPreviewEl();
    if (!video) {
      stopScanCamera();
      return;
    }
    video.srcObject = scanStream;
    await video.play();
    showScanPreview();
    setScanStatus('バーコードを枠に合わせてください。');
    scanLoop();
  } catch (err) {
    stopScanCamera();
    setScanStatus('カメラを使えません。JANコードを入力してください。', 'error');
  }
}

function openInventoryScan() {
  const modal = scanModalEl();
  const input = scanCodeInputEl();
  if (!modal) return;
  stopScanCamera();
  lastScanCode = '';
  lastScanAt = 0;
  scanPaused = false;
  if (input) input.value = '';
  setScanStatus('');
  hideScanPreview();
  modal.style.display = 'flex';
  syncBodyScrollLock();
  startScanCamera();
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

const scanCodeInput = scanCodeInputEl();
if (scanCodeInput) {
  scanCodeInput.addEventListener('keydown', event => {
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
  if (overlayIsOpen(scanModalEl())) startScanCamera();
});
