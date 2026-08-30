import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/api';
import { buildDeliveryHandoff, validateBasketItems } from '@/lib/shopping';

export async function POST(request: Request) {
  const limited = rateLimit(request, 'basket-handoff', 30);
  if (limited) return limited;
  try {
    const payload = await request.json() as { items?: unknown; storeId?: unknown; mode?: unknown };
    if (payload.mode !== 'delivery') return NextResponse.json({ error: 'העברת סל זמינה רק במצב משלוח' }, { status: 400 });
    if (typeof payload.storeId !== 'string') return NextResponse.json({ error: 'יש לבחור סניף להעברה' }, { status: 400 });
    const items = validateBasketItems(payload.items);
    if (!items || !Object.keys(items).length) return NextResponse.json({ error: 'הסל ריק או אינו תקין' }, { status: 400 });
    const handoff = buildDeliveryHandoff(items, payload.storeId);
    if (!handoff) return NextResponse.json({ error: 'לא ניתן לבנות העברה עבור הסניף הזה' }, { status: 400 });
    return NextResponse.json({ handoff, note: 'זהו ייצוא/העברה בלבד. האתר לא ביצע הזמנה ולא קיבל פרטי תשלום.' });
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את בקשת ההעברה' }, { status: 400 });
  }
}
