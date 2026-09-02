import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const APP_CATEGORIES = {
  MEDICINE: '医薬品',
  DAILY: '日用品',
  FOOD: '食品・調味料',
  DRINK: '水・コーヒー・お茶・飲料',
} as const;

const CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  { category: APP_CATEGORIES.MEDICINE, keywords: ['医薬品', 'ヘルスケア', 'おくすり', '漢方', 'サプリ', 'ビタミン', '医療', 'ドラッグストア'] },
  { category: APP_CATEGORIES.DRINK, keywords: ['飲料', '水・', 'コーヒー', 'お茶', 'ジュース', 'ビール', 'ワイン', 'お酒', 'ドリンク'] },
  { category: APP_CATEGORIES.FOOD, keywords: ['食品', '調味料', 'お取り寄せ', 'スナック', 'お菓子', '米', '麺', '缶詰', '冷凍', '離乳食', 'ベビーフード', '食品・飲料'] },
  { category: APP_CATEGORIES.DAILY, keywords: ['洗剤', 'ティッシュ', '日用品', '掃除', 'ペット', 'ベビー', 'ホーム＆キッチン', 'ホーム&キッチン'] },
];

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ja,ja-JP;q=0.9,en;q=0.8',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type LohacoIds = { sellerId: string; srid: string };

type ProductMeta = {
  name: string;
  categoryPath: string[];
  appCategory: string;
};

function parseHttpUrl(url: string): URL | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function parseLohacoProductUrl(url: string): LohacoIds | null {
  const parsed = parseHttpUrl(url);
  if (!parsed || !parsed.hostname.toLowerCase().endsWith('lohaco.yahoo.co.jp')) return null;
  const match = parsed.pathname.match(/\/store\/([^/]+)\/item\/([^/]+)/i);
  if (!match) return null;
  const sellerId = decodeURIComponent(match[1]).trim();
  const srid = decodeURIComponent(match[2]).trim();
  if (!sellerId || !srid) return null;
  return { sellerId, srid };
}

function parseAmazonProductUrl(url: string): { asin: string; canonicalUrl: string } | null {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('amazon.co.jp') && !host.endsWith('amazon.com')) return null;
  const patterns = [
    /\/(?:dp|gp\/product|exec\/obidos\/ASIN|product)\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
  ];
  for (const pattern of patterns) {
    const match = parsed.pathname.match(pattern);
    if (match) {
      const asin = match[1].toUpperCase();
      const tld = host.endsWith('amazon.co.jp') ? 'co.jp' : 'com';
      return { asin, canonicalUrl: `https://www.amazon.${tld}/dp/${asin}` };
    }
  }
  return null;
}

function mapCategoryToApp(categoryPath: string[]): string {
  const text = categoryPath.join(' ');
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword))) {
      return rule.category;
    }
  }
  return APP_CATEGORIES.DAILY;
}

function normalizeLohacoProductName(title: string): string {
  let name = String(title || '').trim();
  if (name.startsWith('LOHACO - ')) name = name.slice('LOHACO - '.length);
  return name.trim();
}

function normalizeAmazonProductName(title: string): string {
  let name = String(title || '').trim();
  name = name.replace(/\s*[:：]\s*Amazon\.co\.jp.*$/i, '');
  name = name.replace(/\s*[-|｜]\s*Amazon.*$/i, '');
  return name.trim();
}

function buildCategoryPath(hit: Record<string, unknown>): string[] {
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
  const name = String(hit.name || '').trim();
  if (!name) return null;
  const categoryPath = buildCategoryPath(hit);
  return {
    name,
    categoryPath,
    appCategory: mapCategoryToApp(categoryPath),
  };
}

function extractOgTitle(html: string, normalize: (title: string) => string): string {
  const patterns = [
    /property="og:title"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:title"/i,
    /<meta\s+name="title"\s+content="([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const name = normalize(match[1]);
      if (name) return name;
    }
  }
  return '';
}

function extractLohacoBreadcrumbFromHtml(html: string): string[] {
  const crumbs: string[] = [];
  const seen = new Set<string>();
  const pattern = /href="(\/category\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const name = String(match[2] || '').trim();
    if (!name || seen.has(name)) {
      if (crumbs.length > 0) break;
      continue;
    }
    seen.add(name);
    crumbs.push(name);
    if (crumbs.length >= 6) break;
  }
  return crumbs;
}

function extractAmazonBreadcrumbFromHtml(html: string): string[] {
  const crumbs: string[] = [];
  const seen = new Set<string>();

  const breadcrumbBlock = html.match(/id="wayfinding-breadcrumbs_feature_div"[^>]*>([\s\S]*?)<\/div>/i);
  if (breadcrumbBlock) {
    const linkPattern = /<a[^>]*>([^<]+)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkPattern.exec(breadcrumbBlock[1])) !== null) {
      const name = String(match[1] || '').replace(/&amp;/g, '&').trim();
      if (!name || name === '›' || seen.has(name)) continue;
      seen.add(name);
      crumbs.push(name);
      if (crumbs.length >= 6) break;
    }
  }

  if (crumbs.length) return crumbs;

  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const entry of items) {
        if (entry?.['@type'] !== 'BreadcrumbList' || !Array.isArray(entry.itemListElement)) continue;
        const names = entry.itemListElement
          .map((el: { name?: string; item?: { name?: string } }) => String(el?.name || el?.item?.name || '').trim())
          .filter(Boolean);
        if (names.length) return names.slice(0, 6);
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  return crumbs;
}

async function fetchFromLohacoHtml(url: string): Promise<ProductMeta | null> {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) return null;
  const html = await response.text();
  const name = extractOgTitle(html, normalizeLohacoProductName);
  if (!name) return null;
  const categoryPath = extractLohacoBreadcrumbFromHtml(html);
  return {
    name,
    categoryPath,
    appCategory: mapCategoryToApp(categoryPath),
  };
}

async function fetchFromAmazonHtml(url: string): Promise<ProductMeta | null> {
  const ids = parseAmazonProductUrl(url);
  if (!ids) return null;
  const response = await fetch(ids.canonicalUrl, { headers: FETCH_HEADERS });
  if (!response.ok) return null;
  const html = await response.text();
  const name = extractOgTitle(html, normalizeAmazonProductName);
  if (!name) return null;
  const categoryPath = extractAmazonBreadcrumbFromHtml(html);
  return {
    name,
    categoryPath,
    appCategory: mapCategoryToApp(categoryPath),
  };
}

async function fetchLohacoProductMeta(url: string): Promise<ProductMeta | null> {
  const ids = parseLohacoProductUrl(url);
  if (!ids) return null;
  const appId = Deno.env.get('YAHOO_APP_ID') || 'demo';
  const fromApi = await fetchFromYahooApi(ids.srid, appId);
  if (fromApi) return fromApi;
  return fetchFromLohacoHtml(url);
}

async function fetchProductMeta(url: string): Promise<ProductMeta | null> {
  if (parseLohacoProductUrl(url)) return fetchLohacoProductMeta(url);
  if (parseAmazonProductUrl(url)) return fetchFromAmazonHtml(url);
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const body = await req.json();
    const url = String(body?.url || '').trim();
    if (!url) {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const meta = await fetchProductMeta(url);
    if (!meta) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(meta), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
