export const DEFAULT_PRODUCT_CATEGORY = '日用品';

export const PRODUCT_CATEGORY_RULES = [
  { category: '医薬品', keywords: ['医薬品', 'ヘルスケア', 'おくすり', '漢方', 'サプリ', 'ビタミン', '医療', 'ドラッグストア'] },
  { category: '水・コーヒー・お茶・飲料', keywords: ['飲料', '水・', 'コーヒー', 'お茶', 'ジュース', 'ビール', 'ワイン', 'お酒', 'ドリンク'] },
  { category: '食品・調味料', keywords: ['食品', '調味料', 'お取り寄せ', 'スナック', 'お菓子', '米', '麺', '缶詰', '冷凍', '離乳食', 'ベビーフード', '食品・飲料'] },
  { category: DEFAULT_PRODUCT_CATEGORY, keywords: ['洗剤', 'ティッシュ', '日用品', '掃除', 'ペット', 'ベビー', 'ホーム＆キッチン', 'ホーム&キッチン'] },
];

export function mapCategoryToApp(categoryPath) {
  const text = (categoryPath || []).join(' ');
  for (const rule of PRODUCT_CATEGORY_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword))) {
      return rule.category;
    }
  }
  return DEFAULT_PRODUCT_CATEGORY;
}

if (typeof globalThis !== 'undefined') {
  globalThis.ProductMetaShared = {
    ...(globalThis.ProductMetaShared || {}),
    DEFAULT_PRODUCT_CATEGORY,
    PRODUCT_CATEGORY_RULES,
    mapCategoryToApp,
  };
}
