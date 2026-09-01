const LOHACO_CATEGORY_RULES = [
  { category: '医薬品', keywords: ['医薬品', 'ヘルスケア', 'おくすり', '漢方', 'サプリ', 'ビタミン', '医療'] },
  { category: '水・コーヒー・お茶・飲料', keywords: ['飲料', '水・', 'コーヒー', 'お茶', 'ジュース', 'ビール', 'ワイン', 'お酒'] },
  { category: '食品・調味料', keywords: ['食品', '調味料', 'お取り寄せ', 'スナック', 'お菓子', '米', '麺', '缶詰', '冷凍', '離乳食', 'ベビーフード'] },
  { category: '日用品', keywords: ['洗剤', 'ティッシュ', '日用品', '掃除', 'ペット', 'ベビー'] },
];

function mapLohacoCategoryToApp(categoryPath) {
  const text = (categoryPath || []).join(' ');
  for (const rule of LOHACO_CATEGORY_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword))) {
      return rule.category;
    }
  }
  return '日用品';
}

function normalizeLohacoProductName(title) {
  let name = String(title || '').trim();
  if (name.startsWith('LOHACO - ')) name = name.slice('LOHACO - '.length);
  return name.trim();
}

async function fetchLohacoProductMeta(url) {
  if (!parseLohacoProductUrl(url)) return null;
  if (!isCloudReady()) return null;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.functions.invoke('lohaco-product', {
      body: { url: normalizeProductPageUrl(url) },
    });
    if (error || !data) return null;
    const name = normalizeLohacoProductName(data.name);
    if (!name) return null;
    const categoryPath = Array.isArray(data.categoryPath)
      ? data.categoryPath.map(entry => String(entry || '').trim()).filter(Boolean)
      : [];
    const appCategory = String(data.appCategory || '').trim() || mapLohacoCategoryToApp(categoryPath);
    return { name, categoryPath, appCategory };
  } catch {
    return null;
  }
}
