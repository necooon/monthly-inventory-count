export type LohacoIds = { sellerId: string; srid: string };
export type AmazonIds = { asin: string; canonicalUrl: string };

export {
  parseHttpUrl,
  parseLohacoProductUrl,
  parseAmazonProductUrl,
  isProductMetaFetchableUrl,
} from '../../../shared/urlParsers.js';
