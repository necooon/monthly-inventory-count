const SCAN_DEBOUNCE_MS = 1500;
const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let scanStream = null;
let scanRaf = 0;
let scanDetector = null;
let scanPaused = false;
let lastScanCode = '';
let lastScanAt = 0;
let scanCodeHandler = null;

function canUseScanCamera() {
  return typeof window.BarcodeDetector === 'function'
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
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

async function scanDetectFrame() {
  if (!scanDetector || !scanStream || scanPaused || !scanCodeHandler) return;
  const video = document.getElementById('scan-preview');
  if (!video || video.readyState < 2) return;
  try {
    const codes = await scanDetector.detect(video);
    const raw = codes && codes[0] && codes[0].rawValue;
    if (raw) await scanCodeHandler(raw);
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

async function startScanCamera(onCode) {
  stopScanCamera();
  scanCodeHandler = onCode;
  if (!canUseScanCamera()) return { ok: false, reason: 'unsupported' };

  const video = document.getElementById('scan-preview');
  if (!video) return { ok: false, reason: 'unavailable' };

  try {
    scanDetector = await createScanDetector();
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = scanStream;
    await video.play();
    scanLoop();
    return { ok: true };
  } catch (err) {
    stopScanCamera();
    return { ok: false, reason: 'denied' };
  }
}
