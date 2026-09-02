function sharedApi() {
  return globalThis.ProductMetaShared || {};
}

export function normalizeFetchedProductName(title) {
  let name = String(title || '').trim();
  if (name.startsWith('LOHACO - ')) name = name.slice('LOHACO - '.length);
  name = name.replace(/\s*[:：]\s*Amazon\.co\.jp.*$/i, '');
  name = name.replace(/\s*[-|｜]\s*Amazon.*$/i, '');
  return name.trim();
}

export function parseProductMetaResponse(data) {
  if (!data) return null;
  const name = normalizeFetchedProductName(data.name);
  if (!name) return null;
  const categoryPath = Array.isArray(data.categoryPath)
    ? data.categoryPath.map(entry => String(entry || '').trim()).filter(Boolean)
    : [];
  const appCategory = String(data.appCategory || '').trim()
    || sharedApi().mapCategoryToApp(categoryPath);
  return { name, categoryPath, appCategory };
}

if (typeof globalThis !== 'undefined') {
  globalThis.ProductMetaShared = {
    ...(globalThis.ProductMetaShared || {}),
    normalizeFetchedProductName,
    parseProductMetaResponse,
  };
}
