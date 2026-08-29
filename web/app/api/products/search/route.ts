import { NextResponse } from 'next/server';
import { getPrice, searchProducts, stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';

export async function GET(request: Request) {
  const limited = rateLimit(request, 'product-search'); if (limited) return limited;
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const barcode = (url.searchParams.get('barcode') ?? '').trim();
  const storeId = url.searchParams.get('storeId') ?? stores[0].id;
  if (query.length > 120 || barcode.length > 32) return NextResponse.json({ error: 'שאילתת חיפוש ארוכה מדי' }, { status: 400 });
  if (!stores.some((store) => store.id === storeId)) return NextResponse.json({ error: 'סניף לא מוכר' }, { status: 400 });
  const results = barcode ? searchProducts(barcode).filter((product) => product.barcode === barcode) : searchProducts(query);
  return NextResponse.json({ results: results.map((product) => ({ ...product, price: getPrice(product, storeId) })), storeId, query, freshness: 'הנתונים עודכנו היום' });
}
