const SWIPE_THRESHOLD_PX = 56;
const SWIPE_HORIZONTAL_RATIO = 1.4;

function swipeNavigationBlocked() {
  if (document.body.classList.contains('modal-open')) return true;
  if (typeof openOverlays === 'function' && openOverlays().length > 0) return true;
  return false;
}

function swipeShouldIgnoreTarget(target) {
  if (!target || !target.closest) return false;
  return !!target.closest(
    'input, textarea, select, button, a, label, .modal-overlay, .modal-content, [contenteditable="true"]'
  );
}

function pageIndex(page) {
  return PAGE_IDS.indexOf(page);
}

function showAdjacentPage(delta) {
  const next = PAGE_IDS[pageIndex(currentPage) + delta];
  if (next) showPage(next);
}

function initSwipeNavigation() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    if (swipeNavigationBlocked()) return;
    if (swipeShouldIgnoreTarget(event.target)) return;
    tracking = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    tracking = false;
  }, { passive: true });

  document.addEventListener('touchend', (event) => {
    if (!tracking) return;
    tracking = false;
    if (swipeNavigationBlocked()) return;
    if (event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD_PX) return;
    if (absDx < absDy * SWIPE_HORIZONTAL_RATIO) return;

    if (dx < 0) showAdjacentPage(1);
    else showAdjacentPage(-1);
  }, { passive: true });
}
