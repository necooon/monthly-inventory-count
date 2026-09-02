import { mapCategoryToApp } from './categoryRules.ts';
import { extractAmazonBreadcrumbFromHtml, extractLohacoBreadcrumbFromHtml, extractOgTitle } from './htmlExtractors.ts';
import { buildProductMeta, FETCH_HEADERS, type ProductMeta } from './productMetaTypes.ts';
import { parseAmazonProductUrl, parseLohacoProductUrl } from './urlParsers.ts';

function buildYahooCategoryPath(hit: Record<string, unknown>): string[] {
  const parents = Array.isArray(hit.parentGenreCategories)
    ? hit.parentGenreCategories
        .slice()
        .sort((a: { depth?: number }, b: { depth?: number }) => (a.depth || 0) - (b.depth || 0))
        .map((entry: { name?: string }) => String(entry.name || '').trim())
        .filter(Boolean)
    : [];
  const genre = hit.genreCategory as { name?: string } | undefined;
  const genreName = genre?.name ? String(genre.name).trim() : '';
  if (genreName && !parents.includes(genreName)) parents.push(genreName);
  return parents;
}

async function fetchFromYahooApi(srid: string, appId: string): Promise<ProductMeta | null> {
  const apiUrl = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${encodeURIComponent(appId)}&query=${encodeURIComponent(srid)}&results=5`;
  const response = await fetch(apiUrl);
  if (!response.ok) return null;
  const data = await response.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  const hit = hits.find((entry: { url?: string }) => String(entry?.url || '').includes('lohaco.yahoo.co.jp'));
  if (!hit) return null;
  const categoryPath = buildYahooCategoryPath(hit);
  return buildProductMeta(String(hit.name || '').trim(), categoryPath, mapCategoryToApp(categoryPath));
}

async function fetchHtmlProductMeta(
  url: string,
  extractBreadcrumbs: (html: string) => string[],
): Promise<ProductMeta | null> {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) return null;
  const html = await response.text();
  const name = extractOgTitle(html);
  if (!name) return null;
  const categoryPath = extractBreadcrumbs(html);
  return buildProductMeta(name, categoryPath, mapCategoryToApp(categoryPath));
}

async function fetchLohacoProductMeta(url: string): Promise<ProductMeta | null> {
  const ids = parseLohacoProductUrl(url);
  if (!ids) return null;
  const appId = Deno.env.get('YAHOO_APP_ID') || 'demo';
  const fromApi = await fetchFromYahooApi(ids.srid, appId);
  if (fromApi) return fromApi;
  return fetchHtmlProductMeta(url, extractLohacoBreadcrumbFromHtml);
}

async function fetchAmazonProductMeta(url: string): Promise<ProductMeta | null> {
  const ids = parseAmazonProductUrl(url);
  if (!ids) return null;
  return fetchHtmlProductMeta(ids.canonicalUrl, extractAmazonBreadcrumbFromHtml);
}

export async function fetchProductMeta(url: string): Promise<ProductMeta | null> {
  if (parseLohacoProductUrl(url)) return fetchLohacoProductMeta(url);
  if (parseAmazonProductUrl(url)) return fetchAmazonProductMeta(url);
  return null;
}
