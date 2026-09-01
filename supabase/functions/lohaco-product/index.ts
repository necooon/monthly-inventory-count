import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const APP_CATEGORIES = {
  MEDICINE: '医薬品',
  DAILY: '日用品',
  FOOD: '食品・調味料',
  DRINK: '水・コーヒー・お茶・飲料',
} as const;

const CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  { category: APP_CATEGORIES.MEDICINE, keywords: ['医薬品', 'ヘルスケア', 'おくすり', '漢方', 'サプリ', 'ビタミン', '医療'] },
  { category: APP_CATEGORIES.DRINK, keywords: ['飲料', '水・', 'コーヒー', 'お茶', 'ジュース', 'ビール', 'ワイン', 'お酒'] },
  { category: APP_CATEGORIES.FOOD, keywords: ['食品', '調味料', 'お取り寄せ', 'スナック', 'お菓子', '米', '麺', '缶詰', '冷凍', '離乳食', 'ベビーフード'] },
  { category: APP_CATEGORIES.DAILY, keywords: ['洗剤', 'ティッシュ', '日用品', '掃除', 'ペット', 'ベビー'] },
];

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

function parseLohacoProductUrl(url: string): LohacoIds | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!parsed.hostname.toLowerCase().endsWith('lohaco.yahoo.co.jp')) return null;
    const match = parsed.pathname.match(/\/store\/([^/]+)\/item\/([^/]+)/i);
    if (!match) return null;
    const sellerId = decodeURIComponent(match[1]).trim();
    const srid = decodeURIComponent(match[2]).trim();
    if (!sellerId || !srid) return null;
    return { sellerId, srid };
  } catch {
    return null;
  }
}

function mapLohacoCategoryToApp(categoryPath: string[]): string {
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
    appCategory: mapLohacoCategoryToApp(categoryPath),
  };
}

function extractOgTitle(html: string): string {
  const match = html.match(/property="og:title"\s+content="([^"]+)"/i);
  return match ? normalizeLohacoProductName(match[1]) : '';
}

function extractBreadcrumbFromHtml(html: string): string[] {
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

async function fetchFromLohacoHtml(url: string): Promise<ProductMeta | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CheckStock/1.0)',
      'Accept-Language': 'ja',
    },
  });
  if (!response.ok) return null;
  const html = await response.text();
  const name = extractOgTitle(html);
  if (!name) return null;
  const categoryPath = extractBreadcrumbFromHtml(html);
  return {
    name,
    categoryPath,
    appCategory: mapLohacoCategoryToApp(categoryPath),
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
    const meta = await fetchLohacoProductMeta(url);
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
