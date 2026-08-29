export type Store = {
  id: string;
  chain: string;
  name: string;
  address: string;
  distanceKm: number;
  color: 'mint' | 'blue' | 'yellow';
  coordinates: { lat: number; lon: number };
  openNow: boolean;
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

export type Product = {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  size: string;
  category: string;
  tag: string;
  icon: string;
  prices: Record<string, PriceObservation>;
  promotions: Promotion[];
};

const fresh = '2026-08-30T08:18:00+03:00';

export const stores: Store[] = [
  { id: 'shufersal-avenue', chain: 'שופרסל', name: 'שופרסל דיל · אבן גבירול', distanceKm: 0.8, address: 'אבן גבירול 124, תל אביב', color: 'mint', coordinates: { lat: 32.086, lon: 34.783 }, openNow: true },
  { id: 'rami-levy-azrieli', chain: 'רמי לוי', name: 'רמי לוי · מגדלי תל אביב', distanceKm: 1.6, address: 'דרך מנחם בגין 132, תל אביב', color: 'blue', coordinates: { lat: 32.074, lon: 34.79 }, openNow: true },
  { id: 'victory-yh', chain: 'ויקטורי', name: 'ויקטורי · יהודה המכבי', distanceKm: 2.1, address: 'יהודה המכבי 42, תל אביב', color: 'yellow', coordinates: { lat: 32.094, lon: 34.793 }, openNow: true },
];

export const products: Product[] = [
  {
    id: 'milk', barcode: '7290004123456', name: 'חלב 3% מועשר בקרטון', brand: 'תנובה', size: '1 ליטר', category: 'מוצרי חלב', tag: 'מחיר מפוקח', icon: '🥛',
    prices: {
      'shufersal-avenue': { amount: 7.28, unitPrice: '7.28 ₪ לליטר', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'rami-levy-azrieli': { amount: 6.9, unitPrice: '6.90 ₪ לליטר', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: 7.28, unitPrice: '7.28 ₪ לליטר', updatedAt: '2026-08-30T07:55:00+03:00', available: true, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
  {
    id: 'cereal', barcode: '7290012345678', name: 'קורנפלקס תלמה', brand: 'תלמה', size: '750 גרם', category: 'דגני בוקר', tag: 'מבצע 1+1', icon: '🥣',
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
    id: 'tomatoes', barcode: '7290023456789', name: 'עגבניות אשכולות', brand: 'תוצרת ישראל', size: '1 ק״ג', category: 'פירות וירקות', tag: 'טרי היום', icon: '🍅',
    prices: {
      'shufersal-avenue': { amount: 8.9, unitPrice: '8.90 ₪ לק״ג', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'rami-levy-azrieli': { amount: 7.9, unitPrice: '7.90 ₪ לק״ג', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: null, unitPrice: 'לא זמין כרגע', updatedAt: '2026-08-29T18:20:00+03:00', available: false, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
  {
    id: 'pasta', barcode: '7290034567890', name: 'ספגטי מספר 8', brand: 'אסם', size: '500 גרם', category: 'מזווה', tag: 'מחיר טוב', icon: '🍝',
    prices: {
      'shufersal-avenue': { amount: 8.9, unitPrice: '1.78 ₪ ל-100 גרם', updatedAt: fresh, available: true, source: 'Shufersal · PriceFull' },
      'rami-levy-azrieli': { amount: 7.5, unitPrice: '1.50 ₪ ל-100 גרם', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: 8.9, unitPrice: '1.78 ₪ ל-100 גרם', updatedAt: '2026-08-30T06:42:00+03:00', available: true, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
  {
    id: 'eggs', barcode: '7290045678901', name: 'ביצים L · 12 יחידות', brand: 'ישר למהדרין', size: '12 יחידות', category: 'מוצרי יסוד', tag: 'במלאי', icon: '🥚',
    prices: {
      'shufersal-avenue': { amount: 14.9, unitPrice: '1.24 ₪ לביצה', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'rami-levy-azrieli': { amount: 13.9, unitPrice: '1.16 ₪ לביצה', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
      'victory-yh': { amount: 15.9, unitPrice: '1.33 ₪ לביצה', updatedAt: fresh, available: true, source: 'Cerberus · PriceFull' },
    }, promotions: [],
  },
];

export const money = (value: number) => `${value.toFixed(2)} ₪`;
export const formatDistance = (km: number) => km < 1 ? `${Math.round(km * 1000)} מ׳` : `${km.toFixed(1)} ק״מ`;
const round = (value: number) => Number(value.toFixed(2));

export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('he-IL').replace(/[״”“'`.,/\\-]/g, '').replace(/\s+/g, ' ').trim();
}

export function searchProducts(query: string) {
  const q = normalizeSearch(query);
  if (!q) return products;
  return products.filter((p) => normalizeSearch(`${p.name} ${p.brand} ${p.category} ${p.barcode}`).includes(q));
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

export function calculateBasket(items: Record<string, number>, storeId: string) {
  const lines = Object.entries(items).map(([id, quantity]) => {
    const product = products.find((p) => p.id === id);
    return product ? { product, quantity, calculation: calculateLine(product, storeId, quantity) } : null;
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

export function findAddressResults(query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  const known = [
    { id: 'tel-aviv', label: 'תל אביב-יפו', detail: 'מחוז תל אביב', lat: 32.0853, lon: 34.7818 },
    { id: 'even-gvirol', label: 'אבן גבירול 124, תל אביב-יפו', detail: 'תל אביב-יפו', lat: 32.086, lon: 34.783 },
    { id: 'begin', label: 'דרך מנחם בגין 132, תל אביב-יפו', detail: 'תל אביב-יפו', lat: 32.074, lon: 34.79 },
  ];
  return known.filter((result) => normalizeSearch(`${result.label} ${result.detail}`).includes(normalized));
}
