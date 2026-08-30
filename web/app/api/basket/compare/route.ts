import { NextResponse } from 'next/server';
import { calculateBasket, stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';

export async function POST(request: Request) {
  const limited = rateLimit(request, 'basket-compare'); if (limited) return limited;
  try {
    const payload = await request.json() as { items?: Record<string, number>; storeId?: string };
    const items = payload.items;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return NextResponse.json({ error: 'סל לא תקין' }, { status: 400 });
    if (Object.keys(items).length > 100) return NextResponse.json({ error: 'הסל מכיל יותר מדי מוצרים' }, { status: 400 });
    const safeItems = Object.fromEntries(Object.entries(items).filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0 && quantity <= 99));
    if (typeof payload.storeId !== 'string' || !stores.some((store) => store.id === payload.storeId)) return NextResponse.json({ error: 'יש לבחור סניף מוכר לפני השוואת הסל' }, { status: 400 });
    const selectedStore = payload.storeId;
    const totals = Object.fromEntries(stores.map((store) => [store.id, { store, ...calculateBasket(safeItems, store.id) }]));
    return NextResponse.json({ selectedStore, totals, note: 'מחירים עשויים להשתנות בקופה; המחיר בסניף הוא הקובע.' });
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את הסל' }, { status: 400 });
  }
}
