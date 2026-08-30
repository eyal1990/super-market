export type Store = {
  id: string;
  retailerId: string;
  chain: string;
  name: string;
  address: string;
  distanceKm: number | null;
  color: 'mint' | 'blue' | 'yellow';
  coordinates: { lat: number; lon: number };
  openNow: boolean | null;
  delivery: {
    capability: 'deep_link' | 'partial' | 'manual' | 'unsupported';
    retailerUrl?: string;
    coverageVerified: boolean;
    feesVerified: boolean;
  };
};

export type PriceObservation = {
  amount: number | null;
  unitPrice: string;
  updatedAt: string;
  available: boolean;
  source: string;
};

export type Promotion = {
  id: string;
  kind: 'public' | 'club';
  label: string;
  minimumQuantity?: number;
  offerPrice?: number;
  clubPrice?: number;
  validUntil: string;
  explanation: string;
};

export type ProductImageMetadata = {
  url?: string;
  alt: string;
  status: 'verified' | 'candidate' | 'missing' | 'failed';
  fallbackLabel: string;
  source?: string;
  attribution?: string;
};

export type ProductProvenance = {
  sourceFileIds: string[];
  sourceUris: string[];
  lastObservedAt: string;
};

export type Product = {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  size: string;
  category: string;
  tag: string;
  icon: string;
  aliases: string[];
  imageUrl?: string;
  imageAlt: string;
  image?: ProductImageMetadata;
  branchAvailability?: Record<string, boolean>;
  provenance?: ProductProvenance;
  prices: Record<string, PriceObservation>;
  promotions: Promotion[];
};

const fresh = '2026-08-30T08:18:00+03:00';

function openFoodFactsImage(barcode: string) {
  const digits = barcode.replace(/\D/g, '').padStart(13, '0');
  return `https://images.openfoodfacts.org/images/products/${digits.slice(0, 3)}/${digits.slice(3, 6)}/${digits.slice(6, 9)}/${digits.slice(9)}/front_he.400.jpg`;
}

export function getProductImageMetadata(product: Pick<Product, 'imageUrl' | 'imageAlt'>): ProductImageMetadata {
  const fallbackLabel = 'תמונת מוצר אינה זמינה';
  const alt = product.imageAlt.trim() || fallbackLabel;
  if (!product.imageUrl) return { status: 'missing', alt, fallbackLabel };
  try {
    const url = new URL(product.imageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported image protocol');
    return {
      url: url.toString(),
      status: 'candidate',
      alt,
      fallbackLabel,
      source: 'Open Food Facts',
      attribution: 'Open Food Facts; verify current image licensing and attribution before production publication',
    };
  } catch {
    return { status: 'missing', alt, fallbackLabel };
  }
}

/** Preserve the honest placeholder contract after a browser image error. */
export function failedProductImageMetadata(product: Pick<Product, 'imageUrl' | 'imageAlt'>): ProductImageMetadata {
  const metadata = getProductImageMetadata(product);
  return { ...metadata, url: undefined, status: 'failed', attribution: metadata.attribution };
}

export const stores: Store[] = [
  { id: 'shufersal-avenue', retailerId: 'shufersal', chain: 'שופרסל', name: 'שופרסל דיל · אבן גבירול', distanceKm: 0.8, address: 'אבן גבירול 124, תל אביב', color: 'mint', coordinates: { lat: 32.086, lon: 34.783 }, openNow: true, delivery: { capability: 'partial', retailerUrl: 'https://www.shufersal.co.il/', coverageVerified: false, feesVerified: false } },
  { id: 'rami-levy-azrieli', retailerId: 'rami-levy', chain: 'רמי לוי', name: 'רמי לוי · מגדלי תל אביב', distanceKm: 1.6, address: 'דרך מנחם בגין 132, תל אביב', color: 'blue', coordinates: { lat: 32.074, lon: 34.79 }, openNow: true, delivery: { capability: 'manual', retailerUrl: 'https://www.rami-levy.co.il/', coverageVerified: false, feesVerified: false } },
  { id: 'victory-yh', retailerId: 'victory', chain: 'ויקטורי', name: 'ויקטורי · יהודה המכבי', distanceKm: 2.1, address: 'יהודה המכבי 42, תל אביב', color: 'yellow', coordinates: { lat: 32.094, lon: 34.793 }, openNow: true, delivery: { capability: 'manual', retailerUrl: 'https://www.victory.co.il/', coverageVerified: false, feesVerified: false } },
];

const fixtureProducts: Product[] = [
  {
    id: 'milk', barcode: '7290004123456', name: 'חלב 3% מועשר בקרטון', brand: 'תנובה', size: '1 ליטר', category: 'מוצרי חלב', tag: 'מחיר מפוקח', icon: '🥛', aliases: ['milk', 'tanuva', 'חלב תנובה'], imageUrl: openFoodFactsImage('7290004123456'), imageAlt: 'אריזת חלב 3% מועשר בקרטון',
    prices: {
      'shufersal-avenue': { amount: 7.28, unitPrice: '7.28 ₪ לליטר', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'rami-levy-azrieli': { amount: 6.9, unitPrice: '6.90 ₪ לליטר', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: 7.28, unitPrice: '7.28 ₪ לליטר', updatedAt: '2026-08-30T07:55:00+03:00', available: true, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
  {
    id: 'cereal', barcode: '7290012345678', name: 'קורנפלקס תלמה', brand: 'תלמה', size: '750 גרם', category: 'דגני בוקר', tag: 'מבצע 1+1', icon: '🥣', aliases: ['cereal', 'corn flakes', 'telma'], imageUrl: openFoodFactsImage('7290012345678'), imageAlt: 'אריזת קורנפלקס תלמה 750 גרם',
    prices: {
      'shufersal-avenue': { amount: 24.9, unitPrice: '3.32 ₪ ל-100 גרם', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'rami-levy-azrieli': { amount: 22.9, unitPrice: '3.05 ₪ ל-100 גרם', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: 25.9, unitPrice: '3.45 ₪ ל-100 גרם', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
    }, promotions: [
      { id: 'cereal-public', kind: 'public', label: '1+1', minimumQuantity: 2, offerPrice: 24.9, validUntil: '2026-09-03', explanation: 'בקניית 2 יחידות, השנייה ללא תשלום. המבצע מחושב במחיר הציבורי.' },
      { id: 'cereal-club', kind: 'club', label: 'מחיר מועדון', clubPrice: 19.9, validUntil: '2026-09-03', explanation: 'מחיר לחברי המועדון בלבד — לא נכלל בסכום הציבורי.' },
    ],
  },
  {
    id: 'tomatoes', barcode: '7290023456789', name: 'עגבניות אשכולות', brand: 'תוצרת ישראל', size: '1 ק״ג', category: 'פירות וירקות', tag: 'טרי היום', icon: '🍅', aliases: ['tomato', 'tomatoes'], imageUrl: openFoodFactsImage('7290023456789'), imageAlt: 'עגבניות אשכולות, קילוגרם אחד',
    prices: {
      'shufersal-avenue': { amount: 8.9, unitPrice: '8.90 ₪ לק״ג', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'rami-levy-azrieli': { amount: 7.9, unitPrice: '7.90 ₪ לק״ג', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: null, unitPrice: 'לא זמין כרגע', updatedAt: '2026-08-29T18:20:00+03:00', available: false, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
  {
    id: 'pasta', barcode: '7290034567890', name: 'ספגטי מספר 8', brand: 'אסם', size: '500 גרם', category: 'מזווה', tag: 'מחיר טוב', icon: '🍝', aliases: ['pasta', 'spaghetti', 'osem'], imageUrl: openFoodFactsImage('7290034567890'), imageAlt: 'אריזת ספגטי מספר 8 של אסם',
    prices: {
      'shufersal-avenue': { amount: 8.9, unitPrice: '1.78 ₪ ל-100 גרם', updatedAt: fresh, available: true, source: 'Shufersal · PriceFull' },
      'rami-levy-azrieli': { amount: 7.5, unitPrice: '1.50 ₪ ל-100 גרם', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: 8.9, unitPrice: '1.78 ₪ ל-100 גרם', updatedAt: '2026-08-30T06:42:00+03:00', available: true, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
  {
    id: 'eggs', barcode: '7290045678901', name: 'ביצים L · 12 יחידות', brand: 'ישר למהדרין', size: '12 יחידות', category: 'מוצרי יסוד', tag: 'במלאי', icon: '🥚', aliases: ['eggs', 'egg', 'ביצים'], imageUrl: openFoodFactsImage('7290045678901'), imageAlt: 'מארז 12 ביצים בגודל L',
    prices: {
      'shufersal-avenue': { amount: 14.9, unitPrice: '1.24 ₪ לביצה', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'rami-levy-azrieli': { amount: 13.9, unitPrice: '1.16 ₪ לביצה', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: 15.9, unitPrice: '1.33 ₪ לביצה', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
];

export const products: Product[] = fixtureProducts.map((product) => ({ ...product, image: getProductImageMetadata(product) }));

export const money = (value: number) => `${value.toFixed(2)} ₪`;
export const formatDistance = (km: number | null) => km === null ? 'מרחק לא חושב' : km < 1 ? `${Math.round(km * 1000)} מ׳` : `${km.toFixed(1)} ק״מ`;
const round = (value: number) => Number(value.toFixed(2));

export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('he-IL')
    .replace(/[ךםןףץ]/g, (letter) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }[letter] ?? letter))
    .replace(/[״”“'`.,/\\-]/g, '').replace(/\s+/g, ' ').trim();
}

export function searchProducts(query: string, catalogProducts: readonly Product[] = products) {
  const q = normalizeSearch(query);
  if (!q) return [...catalogProducts];
  return catalogProducts.filter((p) => normalizeSearch(`${p.name} ${p.brand} ${p.category} ${p.barcode} ${p.aliases.join(' ')}`).includes(q));
}

export function getPrice(product: Product, storeId: string) {
  return product.prices[storeId] ?? { amount: null, unitPrice: 'לא זמין', updatedAt: '', available: false, source: '' };
}

export function isPromotionActive(promotion: Promotion, now = new Date()) {
  const end = new Date(`${promotion.validUntil}T23:59:59+03:00`);
  return !Number.isNaN(end.getTime()) && now <= end;
}

export function calculateLine(product: Product, storeId: string, quantity: number) {
  const price = getPrice(product, storeId);
  const safeQuantity = Math.max(0, Math.floor(quantity));
  if (!price.available || price.amount === null) return { baseTotal: null, publicTotal: null, clubTotal: null, clubSavings: 0, status: 'unavailable' as const, promotionNote: 'המוצר לא זמין בסניף זה' };
  const baseTotal = price.amount * safeQuantity;
  const publicPromotion = product.promotions.find((p) => isPromotionActive(p) && p.kind === 'public' && p.minimumQuantity && p.offerPrice !== undefined);
  const clubPromotion = product.promotions.find((p) => isPromotionActive(p) && p.kind === 'club' && p.clubPrice !== undefined);
  const publicTotal = publicPromotion && safeQuantity >= (publicPromotion.minimumQuantity ?? Infinity)
    ? Math.floor(safeQuantity / (publicPromotion.minimumQuantity ?? 1)) * (publicPromotion.offerPrice ?? price.amount) + (safeQuantity % (publicPromotion.minimumQuantity ?? 1)) * price.amount
    : baseTotal;
  const clubTotal = clubPromotion ? clubPromotion.clubPrice! * safeQuantity : publicTotal;
  return {
    baseTotal, publicTotal, clubTotal: Math.min(publicTotal, clubTotal), clubSavings: Math.max(0, publicTotal - clubTotal),
    status: 'available' as const,
    promotionNote: publicPromotion && safeQuantity >= (publicPromotion.minimumQuantity ?? Infinity) ? `${publicPromotion.label} — תנאי המבצע התקיימו` : undefined,
  };
}

export function calculateBasket(items: Record<string, number>, storeId: string, catalogProducts: readonly Product[] = products) {
  const lines = Object.entries(items).map(([id, quantity]) => {
    const product = catalogProducts.find((p) => p.id === id);
    const safeQuantity = Number.isInteger(quantity) ? Math.max(0, Math.min(99, quantity)) : 0;
    return product && safeQuantity > 0 ? { product, quantity: safeQuantity, calculation: calculateLine(product, storeId, safeQuantity) } : null;
  }).filter((line): line is { product: Product; quantity: number; calculation: ReturnType<typeof calculateLine> } => Boolean(line));
  const available = lines.filter((line) => line.calculation.publicTotal !== null);
  const unavailable = lines.filter((line) => line.calculation.publicTotal === null);
  return {
    lines, unavailable,
    publicTotal: round(available.reduce((sum, line) => sum + (line.calculation.publicTotal ?? 0), 0)),
    clubTotal: round(available.reduce((sum, line) => sum + (line.calculation.clubTotal ?? 0), 0)),
    clubSavings: round(available.reduce((sum, line) => sum + line.calculation.clubSavings, 0)),
  };
}

export type PriceTrustState = 'fresh' | 'stale' | 'unavailable' | 'unknown';

export function isPriceStale(price: PriceObservation, now = new Date(), staleAfterHours = 24) {
  if (!price.updatedAt || !price.available) return false;
  const updated = new Date(price.updatedAt).getTime();
  return Number.isFinite(updated) && now.getTime() - updated > staleAfterHours * 60 * 60 * 1000;
}

export function priceTrustState(price: PriceObservation, now = new Date()): PriceTrustState {
  if (!price.available || price.amount === null) return 'unavailable';
  if (!price.updatedAt) return 'unknown';
  if (!Number.isFinite(new Date(price.updatedAt).getTime())) return 'unknown';
  return isPriceStale(price, now) ? 'stale' : 'fresh';
}

export function freshnessLabel(updatedAt: string, now = new Date()) {
  if (!updatedAt) return 'מועד הבדיקה לא ידוע';
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return 'מועד הבדיקה לא ידוע';
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
  if (minutes < 60) return minutes <= 1 ? 'נבדק עכשיו' : `נבדק לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `נבדק לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `נבדק לפני ${days} ימים`;
}

/** Fixture metadata is deliberately exposed so UI/API consumers do not imply live catalog completeness. */
export const catalogCompleteness = {
  dataset: 'fixture' as const,
  productCount: products.length,
  supportedRetailers: ['cerberus', 'shufersal'] as const,
  branchCount: stores.length,
  branchPriceCoverage: stores.every((store) => products.every((product) => Boolean(product.prices[store.id]))) ? 1 : 0,
  imageCoverage: products.length ? products.filter((product) => Boolean(product.imageUrl)).length / products.length : 1,
  limitations: [
    'זהו קטלוג fixture מייצג לפיתוח; הוא אינו מכיל את כל מוצרי הרשתות בזמן אמת.',
    'מוצר ללא מחיר או תמונה אמיתית מסומן במקום להיחשב זמין או להציג מידע משוער.',
  ],
};

export const ADDRESS_QUERY_MIN_LENGTH = 2;
export const ADDRESS_QUERY_MAX_LENGTH = 120;

export type GeocodingMode = 'fixture' | 'provider';
export type GeocodingGranularity = 'address' | 'street' | 'city' | 'unknown';

/**
 * The normalized contract shared by fixture and live providers. Coordinates
 * are deliberately included so a later nearby-store resolver does not need to
 * parse a display label or depend on a provider-specific response shape.
 */
export type AddressResult = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lon: number;
  coordinates: { lat: number; lon: number };
  countryCode: 'IL';
  confidence: number | null;
  granularity: GeocodingGranularity;
  isExactAddress: boolean;
  source: GeocodingMode;
  provider: string;
};

export type AddressGeocodingProvider = {
  id: string;
  search: (query: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
};

export type AddressGeocoder = {
  mode: GeocodingMode;
  provider: string;
  search: (query: string, options?: { signal?: AbortSignal }) => Promise<AddressResult[]>;
};

export type AddressGeocoderErrorCode = 'timeout' | 'rate_limited' | 'out_of_coverage' | 'unavailable';

export class AddressGeocoderError extends Error {
  readonly code: AddressGeocoderErrorCode;

  constructor(code: AddressGeocoderErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AddressGeocoderError';
    this.code = code;
  }
}

export type AddressGeocoderConfig = {
  endpoint?: string;
  providerName?: string;
  apiKey?: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  provider?: AddressGeocodingProvider;
};

export type AddressQueryValidation =
  | { valid: true; query: string }
  | { valid: false; code: 'required' | 'too_short' | 'too_long' | 'invalid_characters'; error: string };

export function validateAddressQuery(value: string): AddressQueryValidation {
  const query = value.trim();
  const length = Array.from(query).length;
  if (!query) return { valid: false, code: 'required', error: 'יש להזין כתובת או עיר' };
  if (length < ADDRESS_QUERY_MIN_LENGTH) return { valid: false, code: 'too_short', error: 'הכתובת קצרה מדי' };
  if (length > ADDRESS_QUERY_MAX_LENGTH) return { valid: false, code: 'too_long', error: 'כתובת ארוכה מדי' };
  if (/[\u0000-\u001F\u007F]/.test(query)) return { valid: false, code: 'invalid_characters', error: 'הכתובת מכילה תווים לא תקינים' };
  return { valid: true, query };
}

/**
 * Geocoders frequently know a street/city but not every house number. Keep
 * the user's full query for display, while allowing the resolver to ask for a
 * useful nearby street result instead of turning that case into a hard miss.
 */
export function addressQueryWithoutHouseNumber(query: string): string | null {
  const withoutHouseNumber = query
    .replace(/(^|[\s,])\d+[א-ת]?(?=\s|,|$)/g, '$1')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .trim();
  return withoutHouseNumber && withoutHouseNumber !== query.trim() ? withoutHouseNumber : null;
}

const fixtureAddressResults: AddressResult[] = [
  { id: 'tel-aviv', label: 'תל אביב-יפו', detail: 'מחוז תל אביב', lat: 32.0853, lon: 34.7818, coordinates: { lat: 32.0853, lon: 34.7818 }, countryCode: 'IL', confidence: 0.75, granularity: 'city', isExactAddress: false, source: 'fixture', provider: 'fixture' },
  { id: 'even-gvirol', label: 'אבן גבירול 124, תל אביב-יפו', detail: 'תל אביב-יפו', lat: 32.086, lon: 34.783, coordinates: { lat: 32.086, lon: 34.783 }, countryCode: 'IL', confidence: 0.95, granularity: 'address', isExactAddress: true, source: 'fixture', provider: 'fixture' },
  { id: 'begin', label: 'דרך מנחם בגין 132, תל אביב-יפו', detail: 'תל אביב-יפו', lat: 32.074, lon: 34.79, coordinates: { lat: 32.074, lon: 34.79 }, countryCode: 'IL', confidence: 0.95, granularity: 'address', isExactAddress: true, source: 'fixture', provider: 'fixture' },
];

/** Development/test fallback only. It is intentionally small and is not an Israeli address database. */
export function findAddressResults(query: string): AddressResult[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  return fixtureAddressResults.filter((result) => normalizeSearch(`${result.label} ${result.detail}`).includes(normalized));
}

const fixtureGeocoder: AddressGeocoder = {
  mode: 'fixture',
  provider: 'fixture',
  async search(query) {
    return findAddressResults(query);
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function coordinatesFromCandidate(candidate: Record<string, unknown>) {
  const coordinates = candidate.coordinates;
  if (Array.isArray(coordinates)) {
    const lon = asNumber(coordinates[0]); const lat = asNumber(coordinates[1]);
    if (lat !== undefined && lon !== undefined) return { lat, lon };
  }
  const coordinateRecord = asRecord(coordinates);
  const lat = asNumber(coordinateRecord?.lat ?? coordinateRecord?.latitude ?? candidate.lat ?? candidate.latitude);
  const lon = asNumber(coordinateRecord?.lon ?? coordinateRecord?.lng ?? coordinateRecord?.longitude ?? candidate.lon ?? candidate.lng ?? candidate.longitude);
  if (lat !== undefined && lon !== undefined) return { lat, lon };
  const geometry = asRecord(candidate.geometry);
  const geometryCoordinates = geometry?.coordinates;
  if (Array.isArray(geometryCoordinates)) {
    const geometryLon = asNumber(geometryCoordinates[0]); const geometryLat = asNumber(geometryCoordinates[1]);
    if (geometryLat !== undefined && geometryLon !== undefined) return { lat: geometryLat, lon: geometryLon };
  }
  return null;
}

function isIsraeliResult(candidate: Record<string, unknown>, coordinates: { lat: number; lon: number }) {
  const address = asRecord(candidate.address);
  const countryCode = asString(candidate.countryCode ?? candidate.country_code ?? candidate.countrycode ?? address?.countryCode ?? address?.country_code ?? address?.countrycode);
  if (countryCode) return countryCode.toLowerCase() === 'il' || countryCode.toLowerCase() === 'israel';
  return coordinates.lat >= 29 && coordinates.lat <= 33.7 && coordinates.lon >= 34.1 && coordinates.lon <= 35.9;
}

function granularityFromCandidate(candidate: Record<string, unknown>): GeocodingGranularity {
  const value = asString(candidate.granularity ?? candidate.addresstype ?? candidate.type)?.toLowerCase();
  if (value && ['address', 'house', 'building', 'residential'].includes(value)) return 'address';
  if (value === 'street' || value === 'road') return 'street';
  if (value && ['city', 'town', 'village', 'municipality', 'locality'].includes(value)) return 'city';
  return 'unknown';
}

function containsHebrew(value: string) {
  return /[\u0590-\u05ff]/.test(value);
}

function structuredHebrewLabel(candidate: Record<string, unknown>, address: Record<string, unknown> | null) {
  const street = asString(address?.road ?? address?.street ?? address?.street_name ?? candidate.road ?? candidate.street ?? candidate.name);
  const houseNumber = asString(address?.house_number ?? candidate.house_number ?? candidate.houseNumber);
  const city = asString(address?.city ?? address?.town ?? address?.municipality ?? address?.village ?? candidate.city ?? candidate.town);
  const country = asString(address?.country ?? candidate.country);
  const streetPart = street ? [street, houseNumber].filter(Boolean).join(' ') : houseNumber;
  const parts = [streetPart, city, country && containsHebrew(country) ? country : undefined].filter((part): part is string => Boolean(part));
  const label = parts.join(', ');
  return label && containsHebrew(label) ? label : undefined;
}

export function normalizeProviderResults(payload: unknown, provider: string): AddressResult[] {
  const payloadRecord = asRecord(payload);
  const candidates = Array.isArray(payload)
    ? payload
    : payloadRecord && Array.isArray(payloadRecord.results)
      ? payloadRecord.results
      : payloadRecord && Array.isArray(payloadRecord.features)
        ? payloadRecord.features
        : [];
  const normalized: Array<AddressResult | null> = candidates.map((value, index) => {
    const rawCandidate = asRecord(value);
    if (!rawCandidate) return null;
    const featureProperties = asRecord(rawCandidate.properties);
    const candidate = featureProperties ? {
      ...featureProperties,
      ...rawCandidate,
      address: rawCandidate.address ?? featureProperties,
    } : rawCandidate;
    const coordinates = coordinatesFromCandidate(candidate);
    if (!coordinates || !isIsraeliResult(candidate, coordinates)) return null;
    const address = asRecord(candidate.address);
    const providerLabel = asString(candidate.label ?? candidate.displayName ?? candidate.display_name);
    const label = structuredHebrewLabel(candidate, address)
      ?? (providerLabel && containsHebrew(providerLabel) ? providerLabel : undefined)
      ?? [candidate.name ?? candidate.street, candidate.city, candidate.country].map(asString).filter(Boolean).join(', ');
    const detail = asString(candidate.detail ?? candidate.city ?? address?.city ?? address?.town ?? address?.municipality ?? address?.county) ?? 'ישראל';
    if (!label) return null;
    const granularity = granularityFromCandidate(candidate);
    const confidence = asNumber(candidate.confidence);
    return {
      id: asString(candidate.id ?? candidate.placeId ?? candidate.place_id) ?? `${provider}-${index + 1}`,
      label,
      detail,
      lat: coordinates.lat,
      lon: coordinates.lon,
      coordinates,
      countryCode: 'IL',
      confidence: confidence === undefined ? null : Math.max(0, Math.min(1, confidence)),
      granularity,
      isExactAddress: granularity === 'address',
      source: 'provider',
      provider,
    } satisfies AddressResult;
  });
  return normalized.filter((result): result is AddressResult => Boolean(result));
}

function providerCandidates(payload: unknown): unknown[] {
  const record = asRecord(payload);
  if (Array.isArray(payload)) return payload;
  if (record && Array.isArray(record.results)) return record.results;
  if (record && Array.isArray(record.features)) return record.features;
  return [];
}

function createHttpProvider(config: Required<Pick<AddressGeocoderConfig, 'endpoint'>> & AddressGeocoderConfig): AddressGeocodingProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const id = config.providerName?.trim() || 'configured-provider';
  return {
    id,
    async search(query, options = {}) {
      const url = new URL(config.endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('country', 'il');
      url.searchParams.set('countrycodes', 'il');
      url.searchParams.set('limit', '8');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'he');
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 5_000);
      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      try {
        const headers = new Headers({ accept: 'application/json' });
        if (config.userAgent?.trim()) headers.set('user-agent', config.userAgent.trim());
        if (config.apiKey) headers.set('authorization', `Bearer ${config.apiKey}`);
        const response = await fetchImpl(url, { headers, signal: controller.signal });
        if (response.status === 429) throw new AddressGeocoderError('rate_limited', 'Geocoder rate limit reached');
        if (!response.ok) throw new AddressGeocoderError('unavailable', `Geocoder returned ${response.status}`);
        return response.json();
      } catch (error) {
        if (error instanceof AddressGeocoderError) throw error;
        if (timedOut) throw new AddressGeocoderError('timeout', 'Geocoder request timed out');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createAddressGeocoder(config: AddressGeocoderConfig = {}): AddressGeocoder {
  const provider = config.provider ?? (config.endpoint?.trim() ? createHttpProvider(config as Required<Pick<AddressGeocoderConfig, 'endpoint'>>) : null);
  if (!provider) return fixtureGeocoder;
  return {
    mode: 'provider',
    provider: provider.id,
    async search(query, options) {
      const payload = await provider.search(query, options);
      const results = normalizeProviderResults(payload, provider.id);
      const candidates = providerCandidates(payload).map(asRecord).filter((candidate): candidate is Record<string, unknown> => Boolean(candidate));
      if (candidates.length > 0 && results.length === 0 && candidates.every((candidate) => {
        const coordinates = coordinatesFromCandidate(candidate);
        return coordinates !== null && !isIsraeliResult(candidate, coordinates);
      })) {
        throw new AddressGeocoderError('out_of_coverage', 'Geocoder returned results outside Israel');
      }
      return results;
    },
  };
}

export type AddressSearchResolution = {
  results: AddressResult[];
  mode: GeocodingMode;
  configuredMode: GeocodingMode;
  provider: string;
  providerStatus: 'fixture' | 'ok' | 'empty' | 'ambiguous' | 'timeout' | 'rate_limited' | 'out_of_coverage' | 'unavailable';
  fallbackUsed: boolean;
  matchedQuery: string;
  queryFallbackUsed: boolean;
  limitations: string[];
};

function resultStatus(results: AddressResult[]): AddressSearchResolution['providerStatus'] {
  if (!results.length) return 'empty';
  return results.length > 1 && !results.some((result) => result.isExactAddress) ? 'ambiguous' : 'ok';
}

export async function resolveAddressSearch(query: string, geocoder = createAddressGeocoder()): Promise<AddressSearchResolution> {
  if (geocoder.mode === 'fixture') {
    const results = await geocoder.search(query);
    const status = resultStatus(results);
    return { results, mode: 'fixture', configuredMode: 'fixture', provider: geocoder.provider, providerStatus: status === 'ok' ? 'fixture' : status, fallbackUsed: false, matchedQuery: query, queryFallbackUsed: false, limitations: ['מצב fixture מיועד לפיתוח ולבדיקות ואינו מכסה את כל כתובות ישראל.'] };
  }
  try {
    const results = await geocoder.search(query);
    if (results.length) {
      const status = resultStatus(results);
      return { results, mode: 'provider', configuredMode: 'provider', provider: geocoder.provider, providerStatus: status, fallbackUsed: false, matchedQuery: query, queryFallbackUsed: false, limitations: status === 'ambiguous' ? ['נמצאו כמה התאמות. בחרו את הכתובת המדויקת לפני המשך.'] : [] };
    }
    const fallbackQuery = addressQueryWithoutHouseNumber(query);
    if (fallbackQuery) {
      const nearbyResults = await geocoder.search(fallbackQuery);
      if (nearbyResults.length) {
        return {
          results: nearbyResults,
          mode: 'provider',
          configuredMode: 'provider',
          provider: geocoder.provider,
           providerStatus: resultStatus(nearbyResults),
          fallbackUsed: false,
          matchedQuery: fallbackQuery,
          queryFallbackUsed: true,
          limitations: ['לא נמצאה נקודת מפה למספר הבית המדויק; התוצאות הן לפי הרחוב והיישוב.'],
        };
      }
    }
    return { results: [], mode: 'provider', configuredMode: 'provider', provider: geocoder.provider, providerStatus: 'empty', fallbackUsed: false, matchedQuery: query, queryFallbackUsed: false, limitations: ['לא נמצאה התאמה לכתובת הזו. נסו ניסוח אחר או בדקו את הכתובת.'] };
  } catch (error) {
    const code = error instanceof AddressGeocoderError ? error.code : 'unavailable';
    const fallback = findAddressResults(query);
    return { results: fallback, mode: fallback.length ? 'fixture' : 'provider', configuredMode: 'provider', provider: geocoder.provider, providerStatus: code, fallbackUsed: fallback.length > 0, matchedQuery: query, queryFallbackUsed: false, limitations: [code === 'timeout' ? 'החיפוש לא הסתיים בזמן.' : code === 'rate_limited' ? 'ספק הגיאוקוד ביקש להמתין. נסו שוב בעוד דקה.' : code === 'out_of_coverage' ? 'התוצאות שנמצאו אינן בתוך ישראל.' : 'ספק הגיאוקוד לא זמין כרגע. נסו שוב או השתמשו במיקום הנוכחי.'] };
  }
}
