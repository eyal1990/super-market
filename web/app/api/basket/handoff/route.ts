import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/api';
import { buildDeliveryHandoff, handoffAuditRecord, validateBasketItemsDetailed } from '@/lib/shopping';
import { loadStoreDirectory, storesFromDirectory } from '@/lib/store-directory';
import { stores } from '@/lib/data';
import { loadRuntimeCatalog } from '@/lib/catalog-runtime';

export async function POST(request: Request) {
  const limited = rateLimit(request, 'basket-handoff', 30);
  if (limited) return limited;
  try {
    const payload = await request.json() as { items?: unknown; storeId?: unknown; mode?: unknown };
    if (payload.mode !== 'delivery') return NextResponse.json({ error: 'העברת סל זמינה רק במצב משלוח' }, { status: 400 });
    if (typeof payload.storeId !== 'string') return NextResponse.json({ error: 'יש לבחור סניף להעברה' }, { status: 400 });
    const catalog = await loadRuntimeCatalog();
    const validation = validateBasketItemsDetailed(payload.items, false, catalog.products);
    if (!validation.valid) return NextResponse.json({ error: 'invalid_basket', code: 'invalid_basket', issues: validation.issues }, { status: 400, headers: { 'cache-control': 'no-store' } });
    const items = validation.basket;
    if (!items || !Object.keys(items).length) return NextResponse.json({ error: 'הסל ריק או אינו תקין' }, { status: 400 });
    const directory = await loadStoreDirectory();
    const handoff = buildDeliveryHandoff(items, payload.storeId, new Date(), storesFromDirectory(stores, directory.entries), catalog.products);
    if (handoff) console.info(JSON.stringify(handoffAuditRecord(handoff)));
    if (!handoff) return NextResponse.json({ error: 'לא ניתן לבנות העברה עבור הסניף הזה' }, { status: 400 });
    return NextResponse.json({ handoff, catalog: catalog.completeness, catalogSource: catalog.source, fallbackUsed: catalog.fallbackUsed, warnings: catalog.warnings, note: 'זהו ייצוא/העברה בלבד. האתר לא ביצע הזמנה ולא קיבל פרטי תשלום.' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את בקשת ההעברה' }, { status: 400 });
  }
}
