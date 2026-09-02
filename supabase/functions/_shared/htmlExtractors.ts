import { normalizeFetchedProductName } from './productMetaTypes.ts';

export function extractOgTitle(html: string): string {
  const patterns = [
    /property="og:title"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:title"/i,
    /<meta\s+name="title"\s+content="([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const name = normalizeFetchedProductName(match[1]);
      if (name) return name;
    }
  }
  return '';
}

export function extractLohacoBreadcrumbFromHtml(html: string): string[] {
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

export function extractAmazonBreadcrumbFromHtml(html: string): string[] {
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
