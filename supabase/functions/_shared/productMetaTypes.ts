import { normalizeFetchedProductName } from '../../../shared/productMetaCore.js';

export type ProductMeta = {
  name: string;
  categoryPath: string[];
  appCategory: string;
};

export const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ja,ja-JP;q=0.9,en;q=0.8',
};

export { normalizeFetchedProductName };

export function buildProductMeta(name: string, categoryPath: string[], appCategory: string): ProductMeta | null {
  const trimmed = normalizeFetchedProductName(name);
  if (!trimmed) return null;
  return { name: trimmed, categoryPath, appCategory };
}
