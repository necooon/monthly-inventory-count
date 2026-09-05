function migrateProduct(product) {
  const next = { ...(product || {}) };
  if (!isItemUuid(next.id)) next.id = newItemId();
  next.name = String(next.name || '').trim();
  next.itemId = next.itemId ? String(next.itemId) : '';
  next.purchaseDests = normalizePurchaseDests(next.purchaseDests);
  next.purchaseDests.forEach(dest => ensurePurchaseDest(dest));
  next.url = String(next.url || '').trim();
  next.barcode = normalizeBarcode(next.barcode);
  return next;
}

function createCatalogProduct({ name, itemId, dests, url, barcode }) {
  const product = migrateProduct({
    id: newItemId(),
    name,
    itemId,
    purchaseDests: dests,
    url,
    barcode
  });
  catalogProducts.push(product);
  return product;
}

function defaultDestsForNewProduct(itemId, destHint) {
  const hinted = normalizePurchaseDest(destHint);
  if (hinted && hinted !== ADD_NEW_VALUE) return [hinted];
  const item = findItemById(itemId);
  return item ? itemPurchaseDests(item) : [];
}

function migrateHistory(row) {
  const next = { ...(row || {}) };
  if (!isItemUuid(next.id)) next.id = newItemId();
  next.at = next.at || next.happened_at || new Date().toISOString();
  next.itemId = next.itemId ? String(next.itemId) : '';
  next.itemName = String(next.itemName || '');
  next.productId = next.productId ? String(next.productId) : '';
  next.productName = String(next.productName || '');
  next.dest = normalizePurchaseDest(next.dest) || '';
  const qty = Number(next.qty);
  next.qty = Number.isFinite(qty) ? Math.max(0, Math.round(qty)) : 0;
  next.mode = next.mode === 'receipt' ? 'receipt' : 'shopping';
  return next;
}

function normalizeBarcode(value) {
  return String(value || '').replace(/\D/g, '');
}

function barcodeLookupKeys(code) {
  const key = normalizeBarcode(code);
  if (!key) return [];
  const keys = [key];
  if (key.length === 12) keys.push(`0${key}`);
  if (key.length === 13 && key.charAt(0) === '0') keys.push(key.slice(1));
  return keys;
}

function findProductById(id) {
  const key = String(id || '');
  if (!key) return null;
  return catalogProducts.find(p => String(p.id) === key) || null;
}

function findProductsByBarcode(code) {
  const keys = new Set(barcodeLookupKeys(code));
  if (!keys.size) return [];
  return catalogProducts.filter(product =>
    barcodeLookupKeys(product.barcode).some(key => keys.has(key))
  );
}

function lookupItemsByBarcode(code) {
  const products = findProductsByBarcode(code);
  if (!products.length) return { status: 'notFound', matches: [] };
  const seen = new Set();
  const matches = [];
  products.forEach(product => {
    if (!product.itemId) return;
    const item = findItemById(product.itemId);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    matches.push({ item, product });
  });
  if (!matches.length) return { status: 'unlinked', matches: [] };
  return { status: 'matched', matches };
}

function findItemsByBarcode(code) {
  return lookupItemsByBarcode(code).matches;
}

function productsForItem(itemId) {
  const key = String(itemId || '');
  return catalogProducts.filter(p => String(p.itemId) === key);
}

function productOptionLabel(product) {
  const dests = productPurchaseDestNames(product);
  return dests.length
    ? `${product.name} — ${formatPurchaseDestList(dests)}`
    : `${product.name}（購入先なし）`;
}

function itemLabel(itemId) {
  const item = findItemById(itemId);
  return item ? item.name : '未所属';
}

function formatHistoryWhen(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${m}/${d} ${h}:${min}`;
}