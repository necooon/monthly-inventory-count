function mapCategoryToApp(categoryPath) {
  const text = (categoryPath || []).join(' ');
  for (const rule of PRODUCT_CATEGORY_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword))) {
      return rule.category;
    }
  }
  return DEFAULT_PRODUCT_CATEGORY;
}

function normalizeFetchedProductName(title) {
  let name = String(title || '').trim();
  if (name.startsWith('LOHACO - ')) name = name.slice('LOHACO - '.length);
  name = name.replace(/\s*[:：]\s*Amazon\.co\.jp.*$/i, '');
  name = name.replace(/\s*[-|｜]\s*Amazon.*$/i, '');
  return name.trim();
}

function parseProductMetaResponse(data) {
  if (!data) return null;
  const name = normalizeFetchedProductName(data.name);
  if (!name) return null;
  const categoryPath = Array.isArray(data.categoryPath)
    ? data.categoryPath.map(entry => String(entry || '').trim()).filter(Boolean)
    : [];
  const appCategory = String(data.appCategory || '').trim() || mapCategoryToApp(categoryPath);
  return { name, categoryPath, appCategory };
}

async function fetchProductMeta(url) {
  if (!isProductMetaFetchableUrl(url)) return null;
  if (!isCloudReady()) return null;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.functions.invoke(PRODUCT_META_FUNCTION, {
      body: { url: normalizeProductPageUrl(url) },
    });
    if (error || !data) return null;
    return parseProductMetaResponse(data);
  } catch {
    return null;
  }
}

async function fetchProductMetaForRegistration(url) {
  if (!isProductMetaFetchableUrl(url)) return null;
  showUndoToast('商品情報を取得中…');
  return fetchProductMeta(url);
}

async function applyFetchedCategory(item, appCategory) {
  const nextCategory = String(appCategory || '').trim();
  if (!nextCategory) return;
  const current = normalizeCategory(item.category);
  if (!current) {
    item.category = ensureCategory(nextCategory);
    showUndoToast(`カテゴリを「${nextCategory}」に設定しました`);
    return;
  }
  if (current === nextCategory) return;
  const choice = await showActionChoice(
    'カテゴリを更新しますか？',
    `現在: ${current}\n取得: ${nextCategory}`,
    [{ label: '更新する', value: 'update' }]
  );
  if (choice === 'update') {
    item.category = ensureCategory(nextCategory);
    showUndoToast(`カテゴリを「${nextCategory}」に更新しました`);
  }
}
