export function parseHttpUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

export function parseLohacoProductUrl(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed || !parsed.hostname.toLowerCase().endsWith('lohaco.yahoo.co.jp')) return null;
  const match = parsed.pathname.match(/\/store\/([^/]+)\/item\/([^/]+)/i);
  if (!match) return null;
  const sellerId = decodeURIComponent(match[1]).trim();
  const srid = decodeURIComponent(match[2]).trim();
  if (!sellerId || !srid) return null;
  return { sellerId, srid };
}

export function parseAmazonProductUrl(url) {
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

export function isProductMetaFetchableUrl(url) {
  return !!(parseLohacoProductUrl(url) || parseAmazonProductUrl(url));
}

if (typeof globalThis !== 'undefined') {
  globalThis.ProductMetaShared = {
    ...(globalThis.ProductMetaShared || {}),
    parseHttpUrl,
    parseLohacoProductUrl,
    parseAmazonProductUrl,
    isProductMetaFetchableUrl,
  };
}
