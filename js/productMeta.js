const PRODUCT_CATEGORY_RULES = [
  { category: '医薬品', keywords: ['医薬品', 'ヘルスケア', 'おくすり', '漢方', 'サプリ', 'ビタミン', '医療', 'ドラッグストア'] },
  { category: '水・コーヒー・お茶・飲料', keywords: ['飲料', '水・', 'コーヒー', 'お茶', 'ジュース', 'ビール', 'ワイン', 'お酒', 'ドリンク'] },
  { category: '食品・調味料', keywords: ['食品', '調味料', 'お取り寄せ', 'スナック', 'お菓子', '米', '麺', '缶詰', '冷凍', '離乳食', 'ベビーフード', '食品・飲料'] },
  { category: '日用品', keywords: ['洗剤', 'ティッシュ', '日用品', '掃除', 'ペット', 'ベビー', 'ホーム＆キッチン', 'ホーム&キッチン'] },
];

function mapCategoryToApp(categoryPath) {
  const text = (categoryPath || []).join(' ');
  for (const rule of PRODUCT_CATEGORY_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword))) {
      return rule.category;
    }
  }
  return '日用品';
}

function normalizeFetchedProductName(title) {
  let name = String(title || '').trim();
  if (name.startsWith('LOHACO - ')) name = name.slice('LOHACO - '.length);
  name = name.replace(/\s*[:：]\s*Amazon\.co\.jp.*$/i, '');
  name = name.replace(/\s*[-|｜]\s*Amazon.*$/i, '');
  return name.trim();
}

async function fetchProductMeta(url) {
  if (!isProductMetaFetchableUrl(url)) return null;
  if (!isCloudReady()) return null;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.functions.invoke('lohaco-product', {
      body: { url: normalizeProductPageUrl(url) },
    });
    if (error || !data) return null;
    const name = normalizeFetchedProductName(data.name);
    if (!name) return null;
    const categoryPath = Array.isArray(data.categoryPath)
      ? data.categoryPath.map(entry => String(entry || '').trim()).filter(Boolean)
      : [];
    const appCategory = String(data.appCategory || '').trim() || mapCategoryToApp(categoryPath);
    return { name, categoryPath, appCategory };
  } catch {
    return null;
  }
}

function fetchLohacoProductMeta(url) {
  return fetchProductMeta(url);
}
