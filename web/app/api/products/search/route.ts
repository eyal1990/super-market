import { NextResponse } from 'next/server';
import { catalogCompleteness, getPrice, priceTrustState, searchProducts, stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';

export async function GET(request: Request) {
  const limited = rateLimit(request, 'product-search'); if (limited) return limited;
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const barcode = (url.searchParams.get('barcode') ?? '').trim();
  const requestedStoreId = url.searchParams.get('storeId');
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '24', 10) || 24));
  if (query.length > 120 || barcode.length > 32) return NextResponse.json({ error: 'שאילתת חיפוש ארוכה מדי' }, { status: 400 });
  if (requestedStoreId && !stores.some((store) => store.id === requestedStoreId)) return NextResponse.json({ error: 'סניף לא מוכר' }, { status: 400 });
  const allResults = barcode ? searchProducts(barcode).filter((product) => product.barcode === barcode) : searchProducts(query);
  const results = allResults.slice((page - 1) * pageSize, page * pageSize);
  return NextResponse.json({ results: results.map((product) => {
    const price = requestedStoreId ? getPrice(product, requestedStoreId) : null;
    return { ...product, price, trustState: price ? priceTrustState(price) : 'unknown' };
  }), page, pageSize, total: allResults.length, hasMore: page * pageSize < allResults.length, storeId: requestedStoreId, query, freshness: 'הנתונים עודכנו היום', catalog: catalogCompleteness });
}
