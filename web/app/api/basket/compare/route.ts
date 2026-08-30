import { NextResponse } from 'next/server';
import { stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';
import { loadStoreDirectory, storesFromDirectory } from '@/lib/store-directory';
import { serializeBasketCalculation, validateBasketItemsDetailed } from '@/lib/shopping';

export async function POST(request: Request) {
  const limited = rateLimit(request, 'basket-compare'); if (limited) return limited;
  try {
    const payload = await request.json() as { items?: Record<string, number>; storeId?: string };
    const items = payload.items;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return NextResponse.json({ error: 'סל לא תקין' }, { status: 400 });
    if (Object.keys(items).length > 100) return NextResponse.json({ error: 'הסל מכיל יותר מדי מוצרים' }, { status: 400 });
    const validation = validateBasketItemsDetailed(items, true);
    if (!validation.valid) return NextResponse.json({ error: 'invalid_basket', code: 'invalid_basket', issues: validation.issues }, { status: 400, headers: { 'cache-control': 'no-store' } });
    const safeItems = validation.basket;
    if (!safeItems) return NextResponse.json({ error: 'הסל מכיל מוצרים או כמויות לא תקינים' }, { status: 400 });
    const directory = await loadStoreDirectory();
    const catalogStores = storesFromDirectory(stores, directory.entries);
    if (typeof payload.storeId !== 'string' || !catalogStores.some((store) => store.id === payload.storeId)) return NextResponse.json({ error: 'יש לבחור סניף מוכר לפני השוואת הסל' }, { status: 400 });
    const selectedStore = payload.storeId;
    const totals = Object.fromEntries(catalogStores.map((store) => [store.id, { store, ...serializeBasketCalculation(safeItems, store.id) }]));
    return NextResponse.json({ selectedStore, totals, directory: directory.completeness, note: 'מחירים עשויים להשתנות בקופה; המחיר בסניף הוא הקובע.' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את הסל' }, { status: 400 });
  }
}
