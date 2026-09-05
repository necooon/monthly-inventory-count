const SCAN_DEBOUNCE_MS = 1500;
const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const ZXING_LIBRARY_SRC = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const ZXING_BROWSER_SRC = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';

let scanStream = null;
let scanRaf = 0;
let scanDetector = null;
let scanPaused = false;
let lastScanCode = '';
let lastScanAt = 0;
let scanCodeHandler = null;
let zxingReader = null;
let zxingControls = null;

function canUseScanCamera() {
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

function setScanCameraPaused(paused) {
  scanPaused = !!paused;
}

function resetScanCameraMemory() {
  lastScanCode = '';
  lastScanAt = 0;
  scanPaused = false;
}

function shouldIgnoreScanCode(code, fromManual) {
  const now = Date.now();
  if (!fromManual && code === lastScanCode && now - lastScanAt < SCAN_DEBOUNCE_MS) return true;
  lastScanCode = code;
  lastScanAt = now;
  return false;
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-scan-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('script')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.scanSrc = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error('script'));
    document.head.appendChild(script);
  });
}

async function loadZXingBrowser() {
  if (window.ZXingBrowser && (window.ZXingBrowser.BrowserMultiFormatOneDReader || window.ZXingBrowser.BrowserMultiFormatReader)) {
    return window.ZXingBrowser;
  }
  await loadScriptOnce(ZXING_LIBRARY_SRC);
  await loadScriptOnce(ZXING_BROWSER_SRC);
  return window.ZXingBrowser || null;
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

function stopZXing() {
  if (zxingControls && typeof zxingControls.stop === 'function') {
    try { zxingControls.stop(); } catch (err) { /* ignore */ }
  }
  zxingControls = null;
  if (zxingReader && typeof zxingReader.reset === 'function') {
    try { zxingReader.reset(); } catch (err) { /* ignore */ }
  }
  zxingReader = null;
}

function stopScanCamera() {
  if (scanRaf) {
    cancelAnimationFrame(scanRaf);
    scanRaf = 0;
  }
  stopZXing();
  scanDetector = null;
  scanPaused = false;
  scanCodeHandler = null;
  if (scanStream) {
    scanStream.getTracks().forEach(track => track.stop());
    scanStream = null;
  }
  const video = document.getElementById('scan-preview');
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}

function emitScanCode(raw) {
  if (scanPaused || !scanCodeHandler || !raw) return;
  scanCodeHandler(raw);
}

async function scanDetectFrame() {
  if (!scanDetector || !scanStream || scanPaused || !scanCodeHandler) return;
  const video = document.getElementById('scan-preview');
  if (!video || video.readyState < 2) return;
  try {
    const codes = await scanDetector.detect(video);
    const raw = codes && codes[0] && codes[0].rawValue;
    if (raw) emitScanCode(raw);
  } catch (err) {
    /* keep scanning */
  }
}

function scanLoop() {
  if (!scanStream || !scanDetector) return;
  scanRaf = requestAnimationFrame(async () => {
    await scanDetectFrame();
    if (scanStream && scanDetector) scanLoop();
  });
}

async function startZXingFromStream(video) {
  const ZXingBrowser = await loadZXingBrowser();
  const Reader = ZXingBrowser && (ZXingBrowser.BrowserMultiFormatOneDReader || ZXingBrowser.BrowserMultiFormatReader);
  if (!Reader) return false;
  zxingReader = new Reader();
  if (typeof zxingReader.decodeFromStream === 'function') {
    zxingControls = await zxingReader.decodeFromStream(scanStream, video, (result) => {
      if (result && typeof result.getText === 'function') emitScanCode(result.getText());
    });
    return true;
  }
  if (typeof zxingReader.decodeFromVideoElement === 'function') {
    zxingControls = await zxingReader.decodeFromVideoElement(video, (result) => {
      if (result && typeof result.getText === 'function') emitScanCode(result.getText());
    });
    return true;
  }
  return false;
}

function cameraFailureReason(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotSupportedError') return 'unsupported';
  return 'denied';
}

async function startScanCamera(onCode) {
  stopScanCamera();
  scanCodeHandler = onCode;
  if (!canUseScanCamera()) return { ok: false, reason: 'unsupported' };

  const video = document.getElementById('scan-preview');
  if (!video) return { ok: false, reason: 'unavailable' };

  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = scanStream;
    await video.play();

    if (typeof window.BarcodeDetector === 'function') {
      try {
        scanDetector = await createScanDetector();
        scanLoop();
        return { ok: true };
      } catch (err) {
        scanDetector = null;
      }
    }

    if (await startZXingFromStream(video)) return { ok: true };
    stopScanCamera();
    return { ok: false, reason: 'unsupported' };
  } catch (err) {
    stopScanCamera();
    return { ok: false, reason: cameraFailureReason(err) };
  }
}
