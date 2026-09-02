async function fetchProductMeta(url) {
  if (!isProductMetaFetchableUrl(url)) return null;
  if (!isCloudReady()) return null;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.functions.invoke(PRODUCT_META_FUNCTION, {
      body: { url: normalizeProductPageUrl(url) },
    });
    if (error || !data) return null;
    return ProductMetaShared.parseProductMetaResponse(data);
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

async function enrichProductFromUrl(url, item) {
  const trimmedUrl = String(url || '').trim();
  if (!trimmedUrl || !isProductMetaFetchableUrl(trimmedUrl)) return null;
  const meta = await fetchProductMeta(trimmedUrl);
  if (!meta) return null;
  const inferredDest = inferPurchaseDestFromUrl(trimmedUrl);
  if (inferredDest) ensurePurchaseDest(inferredDest, 'online');
  if (item && meta.appCategory) await applyFetchedCategory(item, meta.appCategory);
  return meta;
}
