const LOHACO_CART_ADD_ORIGIN = 'https://lohaco.yahoo.co.jp';

const ONLINE_STORES = [
  { dest: 'LOHACO', hosts: ['lohaco.yahoo.co.jp'] },
  { dest: 'Amazon', hosts: ['amazon.co.jp', 'amazon.com', 'www.amazon.co.jp'] },
  { dest: '楽天', hosts: ['rakuten.co.jp', 'item.rakuten.co.jp'] },
  { dest: 'ヨドバシ', hosts: ['yodobashi.com', 'www.yodobashi.com'] }
];

function hostMatches(hostname, hosts) {
  const host = String(hostname || '').toLowerCase();
  return hosts.some(entry => host === entry || host.endsWith(`.${entry}`));
}

function parseHttpUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function isHttpProductUrl(url) {
  const parsed = parseHttpUrl(url);
  return parsed != null && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

function normalizeProductPageUrl(url) {
  const parsed = parseHttpUrl(url);
  return parsed ? parsed.href : String(url || '').trim();
}

function inferPurchaseDestFromUrl(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed) return '';
  for (const store of ONLINE_STORES) {
    if (hostMatches(parsed.hostname, store.hosts)) return store.dest;
  }
  return '';
}

function onlinePurchaseDests() {
  return allPurchaseDests().filter(name => destKind(name) === 'online');
}

function productPageUrl(product) {
  if (!product?.url || !isHttpProductUrl(product.url)) return '';
  return normalizeProductPageUrl(product.url);
}

function createOrderExternalLink(href, label, className) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = className || 'product-page-link';
  link.textContent = label;
  return link;
}

function createProductPageLink(product, label, options = {}) {
  const url = productPageUrl(product);
  if (!url) return null;
  const link = createOrderExternalLink(url, label || '商品ページを開く', 'product-page-link');
  if (options.stopPropagation) {
    link.addEventListener('click', event => event.stopPropagation());
  }
  return link;
}

function appendProductName(parent, product) {
  const link = createProductPageLink(product, product.name, { stopPropagation: true });
  if (link) {
    parent.appendChild(link);
    return;
  }
  parent.textContent = product.name;
}

function appendProductUrlMeta(parent, product, options = {}) {
  const link = createProductPageLink(product, product.url, options);
  if (!link) return;
  const urlMeta = document.createElement('span');
  urlMeta.className = 'item-meta';
  urlMeta.appendChild(document.createTextNode('URL: '));
  urlMeta.appendChild(link);
  parent.appendChild(urlMeta);
}

function parseLohacoProductUrl(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed || !hostMatches(parsed.hostname, ['lohaco.yahoo.co.jp'])) return null;
  const match = parsed.pathname.match(/\/store\/([^/]+)\/item\/([^/]+)/i);
  if (!match) return null;
  const sellerId = decodeURIComponent(match[1]).trim();
  const srid = decodeURIComponent(match[2]).trim();
  if (!sellerId || !srid) return null;
  return { sellerId, srid };
}

function parseAmazonProductUrl(url) {
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

function isProductMetaFetchableUrl(url) {
  return !!(parseLohacoProductUrl(url) || parseAmazonProductUrl(url));
}

function lohacoCartAddUrl(product) {
  const ids = parseLohacoProductUrl(productPageUrl(product));
  if (!ids) return '';
  const params = new URLSearchParams({ stockAddress: '0' });
  return `${LOHACO_CART_ADD_ORIGIN}/cartAdd/${encodeURIComponent(ids.sellerId)}/${encodeURIComponent(ids.srid)}/?${params}`;
}

function openLohacoCartAdds(urls) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return;
  list.forEach((href, index) => {
    window.open(href, index === 0 ? '_blank' : `lohaco-cart-${index}`, 'noopener,noreferrer');
  });
}
