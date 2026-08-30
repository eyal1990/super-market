import { getPrice, products, stores, type Product, type Store } from './data.ts';

export type Basket = Record<string, number>;
export type ShoppingMode = 'physical' | 'delivery';

export const BASKET_STORAGE_KEY = 'sal-zol-basket-v2';
export const LEGACY_BASKET_STORAGE_KEY = 'sal-zol-basket';
export const SHOPPING_MODE_STORAGE_KEY = 'sal-zol-shopping-mode';

export function parseBasket(value: string | null): Basket | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const safe = Object.fromEntries(Object.entries(parsed).filter(([id, quantity]) => (
      products.some((product) => product.id === id)
      && Number.isInteger(quantity)
      && quantity > 0
      && quantity <= 99
    )));
    return safe;
  } catch {
    return null;
  }
}

export function parseShoppingMode(value: string | null): ShoppingMode | null {
  return value === 'physical' || value === 'delivery' ? value : null;
}

export type CatalogBranchCoverage = {
  storeId: string;
  pricedProducts: number;
  availableProducts: number;
  staleProducts: number;
  unavailableProducts: number;
  complete: boolean;
};

export function getCatalogBranchCoverage(
  catalogProducts: Product[] = products,
  catalogStores: Store[] = stores,
  now = new Date(),
): CatalogBranchCoverage[] {
  return catalogStores.map((store) => {
    const prices = catalogProducts.map((product) => getPrice(product, store.id));
    const pricedProducts = prices.filter((price) => price.updatedAt && price.source).length;
    const availableProducts = prices.filter((price) => price.available && price.amount !== null).length;
    const staleProducts = prices.filter((price) => {
      const timestamp = price.updatedAt ? new Date(price.updatedAt).getTime() : Number.NaN;
      return price.available && price.amount !== null && Number.isFinite(timestamp) && now.getTime() - timestamp > 24 * 60 * 60 * 1000;
    }).length;
    const unavailableProducts = prices.filter((price) => !price.available || price.amount === null).length;
    return { storeId: store.id, pricedProducts, availableProducts, staleProducts, unavailableProducts, complete: pricedProducts === catalogProducts.length };
  });
}

export type HandoffCapability = 'deep_link' | 'partial' | 'manual' | 'unsupported';

export type HandoffItem = {
  productId: string;
  barcode: string;
  name: string;
  size: string;
  quantity: number;
  price: { amount: number | null; available: boolean; updatedAt: string; source: string };
};

export type DeliveryHandoff = {
  version: '1';
  generatedAt: string;
  retailer: { id: string; name: string; capability: HandoffCapability; retailerUrl?: string };
  branch: { id: string; name: string; address: string };
  items: HandoffItem[];
  warnings: string[];
  privacy: { destinationIncluded: false; exactAddressLogged: false };
};

export function validateBasketItems(items: unknown): Basket | null {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return null;
  const entries = Object.entries(items);
  if (!entries.length || entries.length > 100) return null;
  const safe: Basket = {};
  for (const [id, quantity] of entries) {
    if (!products.some((product) => product.id === id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
    safe[id] = quantity;
  }
  return safe;
}

export function buildDeliveryHandoff(items: Basket, storeId: string, now = new Date(), catalogStores: readonly Store[] = stores): DeliveryHandoff | null {
  const store = catalogStores.find((candidate) => candidate.id === storeId);
  if (!store) return null;
  if (store.delivery.capability === 'unsupported') return null;
  const handoffItems: HandoffItem[] = [];
  const warnings: string[] = [];
  for (const [productId, quantity] of Object.entries(items)) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) continue;
    const price = getPrice(product, store.id);
    handoffItems.push({ productId, barcode: product.barcode, name: product.name, size: product.size, quantity, price: { amount: price.amount, available: price.available, updatedAt: price.updatedAt, source: price.source } });
    if (!price.available || price.amount === null) warnings.push(`${product.name}: אין מחיר זמין בסניף שנבחר`);
    if (price.updatedAt && now.getTime() - new Date(price.updatedAt).getTime() > 24 * 60 * 60 * 1000) warnings.push(`${product.name}: המחיר ישן מ-24 שעות`);
    if (product.promotions.some((promotion) => promotion.kind === 'club')) warnings.push(`${product.name}: מחיר מועדון אינו כלול בהעברה`);
  }
  if (!handoffItems.length) return null;
  if (store.delivery.capability === 'partial') warnings.push('העברה חלקית: יש לאשר את המוצרים באתר הרשת לפני הזמנה.');
  if (store.delivery.capability === 'manual') warnings.push('העברה ידנית: העתיקו את הרשימה לאתר הרשת; לא נפתחת הזמנה אוטומטית.');
  if (!store.delivery.coverageVerified || !store.delivery.feesVerified) warnings.push('כיסוי המשלוח ודמי המשלוח לא אומתו עבור הכתובת הזו.');
  return {
    version: '1', generatedAt: now.toISOString(),
    retailer: { id: store.retailerId, name: store.chain, capability: store.delivery.capability, retailerUrl: store.delivery.retailerUrl },
    branch: { id: store.id, name: store.name, address: store.address },
    items: handoffItems, warnings,
    privacy: { destinationIncluded: false, exactAddressLogged: false },
  };
}
