import { calculateBasket, freshnessLabel, getPrice, isPromotionActive, priceTrustState, products, stores, type Product, type Store } from './data.ts';

export type Basket = Record<string, number>;
export type ShoppingMode = 'physical' | 'delivery';

export const BASKET_STORAGE_KEY = 'sal-zol-basket-v2';
export const LEGACY_BASKET_STORAGE_KEY = 'sal-zol-basket';
export const SHOPPING_MODE_STORAGE_KEY = 'sal-zol-shopping-mode';
export const PERSISTED_BASKET_VERSION = 1;

export function parseBasket(value: string | null): Basket | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const isEnvelope = Object.prototype.hasOwnProperty.call(record, 'version') || Object.prototype.hasOwnProperty.call(record, 'items');
    if (isEnvelope) {
      if (record.version !== PERSISTED_BASKET_VERSION || !record.items || typeof record.items !== 'object' || Array.isArray(record.items)) return null;
      return parseBasketEntries(record.items, true);
    }
    // Accept the original unversioned map so users do not lose an existing basket.
    // Legacy data is sanitized entry-by-entry; the versioned format is strict.
    return parseBasketEntries(record, false);
  } catch {
    return null;
  }
}

function parseBasketEntries(value: object, strict: boolean): Basket | null {
    const entries = Object.entries(value);
    if (entries.length > 100) return null;
    const safe: Basket = {};
    for (const [id, quantity] of entries) {
      if (products.some((product) => product.id === id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 99) {
        safe[id] = quantity as number;
      } else if (strict) {
        return null;
      }
    }
    return Object.keys(safe).length ? safe : null;
}

export function serializeBasket(items: Basket) {
  return JSON.stringify({ version: PERSISTED_BASKET_VERSION, items });
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
  unknownProducts: number;
  availabilityState: 'complete' | 'partial' | 'unknown';
  complete: boolean;
};

export function getCatalogBranchCoverage(
  catalogProducts: readonly Product[] = products,
  catalogStores: readonly Store[] = stores,
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
    const unknownProducts = prices.filter((price) => !price.updatedAt || !price.source).length;
    const availabilityState = unknownProducts > 0 ? 'unknown' : unavailableProducts > 0 ? 'partial' : 'complete';
    // `complete` describes observation coverage, while availabilityState tells
    // callers whether those observations say a product is unavailable.
    const complete = unknownProducts === 0 && pricedProducts === catalogProducts.length;
    return { storeId: store.id, pricedProducts, availableProducts, staleProducts, unavailableProducts, unknownProducts, availabilityState, complete };
  });
}

export type HandoffCapability = 'deep_link' | 'partial' | 'manual' | 'unsupported';

export type PriceAvailabilityState = 'available' | 'unavailable' | 'unknown';

export type PriceContract = {
  amount: number | null;
  unitPrice: string;
  available: boolean;
  availabilityState: PriceAvailabilityState;
  updatedAt: string | null;
  source: string | null;
  trustState: 'fresh' | 'stale' | 'unavailable' | 'unknown';
  freshness: { state: 'fresh' | 'stale' | 'unavailable' | 'unknown'; checkedAt: string | null; label: string };
};

export function priceContract(price: ReturnType<typeof getPrice>, now = new Date()): PriceContract {
  const missingObservation = !price.updatedAt && !price.source;
  const trustState = missingObservation ? 'unknown' : priceTrustState(price, now);
  const availabilityState: PriceAvailabilityState = price.available && price.amount !== null
    ? 'available'
    : missingObservation ? 'unknown' : 'unavailable';
  return {
    amount: price.amount,
    unitPrice: price.unitPrice,
    available: price.available && price.amount !== null,
    availabilityState,
    updatedAt: price.updatedAt || null,
    source: price.source || null,
    trustState,
    freshness: { state: trustState, checkedAt: price.updatedAt || null, label: freshnessLabel(price.updatedAt, now) },
  };
}

export type HandoffItem = {
  productId: string;
  barcode: string;
  name: string;
  size: string;
  quantity: number;
  price: PriceContract;
  promotions: Array<{ id: string; kind: 'public' | 'club'; label: string; validUntil: string; supported: false }>;
};

export type BasketIssue = { code: 'invalid_shape' | 'empty' | 'too_many_items' | 'unknown_product' | 'invalid_quantity'; productId?: string };

export type BasketValidation =
  | { valid: true; basket: Basket }
  | { valid: false; issues: BasketIssue[] };

export function validateBasketItemsDetailed(items: unknown, allowEmpty = false, catalogProducts: readonly Product[] = products): BasketValidation {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return { valid: false, issues: [{ code: 'invalid_shape' }] };
  const entries = Object.entries(items);
  if (!entries.length && !allowEmpty) return { valid: false, issues: [{ code: 'empty' }] };
  if (entries.length > 100) return { valid: false, issues: [{ code: 'too_many_items' }] };
  const safe: Basket = {};
  const issues: BasketIssue[] = [];
  for (const [id, quantity] of entries) {
    if (!catalogProducts.some((product) => product.id === id)) issues.push({ code: 'unknown_product', productId: id });
    else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) issues.push({ code: 'invalid_quantity', productId: id });
    else safe[id] = quantity;
  }
  return issues.length ? { valid: false, issues } : { valid: true, basket: safe };
}

export type DeliveryHandoff = {
  version: '1';
  generatedAt: string;
  retailer: { id: string; name: string; capability: HandoffCapability; retailerUrl?: string };
  branch: { id: string; name: string; address: string };
  items: HandoffItem[];
  warnings: string[];
  warningDetails: Array<{ code: 'unavailable_product' | 'unknown_price' | 'stale_price' | 'unsupported_promotion' | 'club_only_price'; productId: string; message: string }>;
  limitations: { unsupportedProducts: string[]; unavailableProducts: string[]; staleProducts: string[]; unsupportedPromotions: string[]; clubOnlyPrices: string[] };
  status: 'ready' | 'review_required';
  action: 'open_retailer' | 'copy_items';
  orderPlaced: false;
  privacy: { destinationIncluded: false; exactAddressLogged: false };
};

export function validateBasketItems(items: unknown, catalogProducts: readonly Product[] = products): Basket | null {
  const result = validateBasketItemsDetailed(items, false, catalogProducts);
  return result.valid ? result.basket : null;
}

export function buildDeliveryHandoff(items: Basket, storeId: string, now = new Date(), catalogStores: readonly Store[] = stores, catalogProducts: readonly Product[] = products): DeliveryHandoff | null {
  if (!Number.isFinite(now.getTime())) return null;
  const store = catalogStores.find((candidate) => candidate.id === storeId);
  if (!store) return null;
  if (store.delivery.capability === 'unsupported') return null;
  const validation = validateBasketItemsDetailed(items, false, catalogProducts);
  if (!validation.valid) return null;
  const safeItems = validation.basket;
  const handoffItems: HandoffItem[] = [];
  const warnings: string[] = [];
  for (const [productId, quantity] of Object.entries(safeItems)) {
    const product = catalogProducts.find((candidate) => candidate.id === productId);
    if (!product) continue;
    const price = getPrice(product, store.id);
    handoffItems.push({ productId, barcode: product.barcode, name: product.name, size: product.size, quantity, price: priceContract(price, now), promotions: product.promotions.filter((promotion) => isPromotionActive(promotion, now)).map((promotion) => ({ id: promotion.id, kind: promotion.kind, label: promotion.label, validUntil: promotion.validUntil, supported: false as const })) });
    if (!price.available || price.amount === null) warnings.push(`${product.name}: אין מחיר זמין בסניף שנבחר`);
    if (price.updatedAt && !Number.isFinite(new Date(price.updatedAt).getTime())) warnings.push(`${product.name}: מועד בדיקת המחיר אינו תקין`);
    else if (price.updatedAt && now.getTime() - new Date(price.updatedAt).getTime() > 24 * 60 * 60 * 1000) warnings.push(`${product.name}: המחיר ישן מ-24 שעות`);
    if (product.promotions.some((promotion) => promotion.kind === 'club')) warnings.push(`${product.name}: מחיר מועדון אינו כלול בהעברה`);
  }
  if (!handoffItems.length) return null;
  const warningDetails: DeliveryHandoff['warningDetails'] = [];
  const limitations: DeliveryHandoff['limitations'] = { unsupportedProducts: [], unavailableProducts: [], staleProducts: [], unsupportedPromotions: [], clubOnlyPrices: [] };
  for (const item of handoffItems) {
    if (item.price.availabilityState === 'unavailable') {
      const message = 'Selected branch has no available price for this product.';
      warningDetails.push({ code: 'unavailable_product', productId: item.productId, message });
      limitations.unavailableProducts.push(item.productId);
    } else if (item.price.availabilityState === 'unknown') {
      warningDetails.push({ code: 'unknown_price', productId: item.productId, message: 'Price availability is unknown for this product.' });
    }
    if (item.price.trustState === 'stale') {
      const message = 'The selected branch price is older than 24 hours.';
      warningDetails.push({ code: 'stale_price', productId: item.productId, message });
      limitations.staleProducts.push(item.productId);
    } else if (item.price.trustState === 'unknown' && item.price.updatedAt) {
      warningDetails.push({ code: 'unknown_price', productId: item.productId, message: 'The price timestamp is not trustworthy.' });
    }
    for (const promotion of item.promotions) {
      warningDetails.push({ code: 'unsupported_promotion', productId: item.productId, message: 'This promotion cannot be carried into the retailer handoff.' });
      limitations.unsupportedPromotions.push(promotion.id);
      if (promotion.kind === 'club') {
        warningDetails.push({ code: 'club_only_price', productId: item.productId, message: 'Club-only pricing is not included in the handoff.' });
        limitations.clubOnlyPrices.push(item.productId);
      }
    }
  }
  const unique = <T>(values: T[]) => [...new Set(values)];
  if (store.delivery.capability === 'partial') warnings.push('העברה חלקית: יש לאשר את המוצרים באתר הרשת לפני הזמנה.');
  if (store.delivery.capability === 'manual') warnings.push('העברה ידנית: העתיקו את הרשימה לאתר הרשת; לא נפתחת הזמנה אוטומטית.');
  if (!store.delivery.coverageVerified || !store.delivery.feesVerified) warnings.push('כיסוי המשלוח ודמי המשלוח לא אומתו עבור הכתובת הזו.');
  return {
    version: '1', generatedAt: now.toISOString(),
    retailer: { id: store.retailerId, name: store.chain, capability: store.delivery.capability, retailerUrl: store.delivery.retailerUrl },
    branch: { id: store.id, name: store.name, address: store.address },
    items: handoffItems, warnings, warningDetails,
    limitations: { ...limitations, unsupportedProducts: unique(limitations.unsupportedProducts), unavailableProducts: unique(limitations.unavailableProducts), staleProducts: unique(limitations.staleProducts), unsupportedPromotions: unique(limitations.unsupportedPromotions), clubOnlyPrices: unique(limitations.clubOnlyPrices) },
    status: warnings.length || warningDetails.length ? 'review_required' : 'ready',
    action: store.delivery.capability === 'deep_link' ? 'open_retailer' : 'copy_items',
    orderPlaced: false,
    privacy: { destinationIncluded: false, exactAddressLogged: false },
  };
}

function productSummary(product: Product) {
  return { id: product.id, barcode: product.barcode, name: product.name, brand: product.brand, size: product.size, category: product.category, tag: product.tag };
}

/** Serialize a basket for an API response without exposing the product's cross-branch price map. */
export function serializeBasketCalculation(items: Basket, storeId: string, now = new Date(), catalogProducts: readonly Product[] = products) {
  const calculation = calculateBasket(items, storeId, catalogProducts);
  const mapLine = (line: (typeof calculation.lines)[number]) => ({ product: productSummary(line.product), quantity: line.quantity, calculation: line.calculation, price: priceContract(getPrice(line.product, storeId), now) });
  const lines = calculation.lines.map(mapLine);
  const unavailable = calculation.unavailable.map(mapLine);
  const states = Object.keys(items).map((id) => {
    const product = catalogProducts.find((candidate) => candidate.id === id);
    return product ? priceContract(getPrice(product, storeId), now) : null;
  }).filter((price): price is PriceContract => Boolean(price));
  const unknownItems = states.filter((price) => price.availabilityState === 'unknown').length;
  const unavailableItems = states.filter((price) => price.availabilityState === 'unavailable').length;
  return {
    lines, unavailable, publicTotal: calculation.publicTotal, clubTotal: calculation.clubTotal, clubSavings: calculation.clubSavings,
    coverage: { requestedItems: states.length, availableItems: states.length - unknownItems - unavailableItems, unavailableItems, unknownItems, status: unknownItems > 0 ? 'unknown' as const : unavailableItems > 0 ? 'partial' as const : 'complete' as const },
    total: { amount: calculation.publicTotal, excludedItems: unknownItems + unavailableItems, status: unknownItems > 0 || unavailableItems > 0 ? 'partial' as const : 'complete' as const, basis: 'public_branch_prices_before_checkout' as const },
  };
}

/** Safe operational metadata for logs; never include the branch address or destination. */
export function handoffAuditRecord(handoff: DeliveryHandoff) {
  return { event: 'delivery_handoff_prepared', retailerId: handoff.retailer.id, branchId: handoff.branch.id, itemCount: handoff.items.length, warningCount: handoff.warnings.length, addressIncluded: false, orderPlaced: false };
}
