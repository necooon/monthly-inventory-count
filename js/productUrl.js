const ONLINE_STORES = [
  {
    dest: 'LOHACO',
    hosts: ['lohaco.yahoo.co.jp'],
    searchUrl(query) {
      const q = String(query || '').trim();
      if (!q) return '';
      return `https://lohaco.yahoo.co.jp/search/?p=${encodeURIComponent(q)}`;
    }
  },
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

function onlineStoreSearchUrl(dest, query) {
  const destName = normalizePurchaseDest(dest);
  const store = ONLINE_STORES.find(entry => entry.dest === destName);
  return store?.searchUrl ? store.searchUrl(query) : '';
}

function productPageUrl(product) {
  if (!product?.url || !isHttpProductUrl(product.url)) return '';
  return normalizeProductPageUrl(product.url);
}

function onlineProductAccessLinks({ item, product, dest }) {
  const destName = normalizePurchaseDest(dest);
  const url = productPageUrl(product);
  if (url && destName && destKind(destName) === 'online') {
    return [{ href: url, label: `${destName}で開く` }];
  }
  if (url && !destName) {
    return [{ href: url, label: '商品ページを開く' }];
  }
  const searchUrl = onlineStoreSearchUrl(destName, product?.name || item.name);
  if (searchUrl) {
    return [{ href: searchUrl, label: `${destName}で検索` }];
  }
  return [];
}

function createOrderExternalLink(href, label) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'order-online-link';
  link.textContent = label;
  return link;
}

function renderOnlineProductAccessLinks(container, context) {
  container.innerHTML = '';
  onlineProductAccessLinks(context).forEach(({ href, label }) => {
    container.appendChild(createOrderExternalLink(href, label));
  });
}

function mountOnlineAccessActions(item, product, dest) {
  if (destKind(dest) !== 'online') return null;
  const actions = document.createElement('div');
  actions.className = 'order-online-actions';
  renderOnlineProductAccessLinks(actions, { item, product, dest });
  return actions.childElementCount ? actions : null;
}
