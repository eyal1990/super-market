import { NextResponse } from 'next/server';
import { calculateBasket, stores } from '@/lib/data';

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { items?: Record<string, number>; storeId?: string };
    const items = payload.items;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return NextResponse.json({ error: 'סל לא תקין' }, { status: 400 });
    const safeItems = Object.fromEntries(Object.entries(items).filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0 && quantity <= 99));
    const selectedStore = stores.some((store) => store.id === payload.storeId) ? payload.storeId! : stores[0].id;
    const totals = Object.fromEntries(stores.map((store) => [store.id, { store, ...calculateBasket(safeItems, store.id) }]));
    return NextResponse.json({ selectedStore, totals, note: 'מחירים עשויים להשתנות בקופה; המחיר בסניף הוא הקובע.' });
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את הסל' }, { status: 400 });
  }
}
