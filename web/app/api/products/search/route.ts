import { NextResponse } from 'next/server';
import { catalogCompleteness, getPrice, products, searchProducts, stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';
import { loadStoreDirectory, storesFromDirectory } from '@/lib/store-directory';
import { getCatalogBranchCoverage, priceContract } from '@/lib/shopping';

const noStoreHeaders = { 'cache-control': 'no-store' };

function queryInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, 'product-search'); if (limited) return limited;
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const barcode = (url.searchParams.get('barcode') ?? '').trim();
  const requestedStoreId = url.searchParams.get('storeId') ?? null;
  const page = queryInteger(url.searchParams.get('page'), 1, 1_000_000);
  const pageSize = queryInteger(url.searchParams.get('pageSize'), 24, 100);
  const category = (url.searchParams.get('category') ?? '').trim();
  const sort = url.searchParams.get('sort') ?? 'relevance';
  if (page === null || pageSize === null || !['relevance', 'price', 'unit', 'unitPrice'].includes(sort)) return NextResponse.json({ error: 'invalid_pagination_or_sort', code: 'invalid_query_parameters' }, { status: 400 });
  if (query.length > 120 || barcode.length > 32) return NextResponse.json({ error: 'שאילתת חיפוש ארוכה מדי' }, { status: 400 });
  const directory = await loadStoreDirectory();
  const catalogStores = storesFromDirectory(stores, directory.entries);
  if (requestedStoreId && !catalogStores.some((store) => store.id === requestedStoreId)) return NextResponse.json({ error: 'סניף לא מוכר' }, { status: 400 });
  const searched = barcode ? searchProducts(barcode).filter((product) => product.barcode === barcode) : searchProducts(query);
  const categorized = category && category !== 'all' ? searched.filter((product) => product.category === category) : searched;
  const allResults = categorized.map((product, index) => ({ product, index })).sort((left, right) => {
    if (sort === 'relevance') return left.index - right.index;
    const leftPrice = requestedStoreId ? getPrice(left.product, requestedStoreId) : null;
    const rightPrice = requestedStoreId ? getPrice(right.product, requestedStoreId) : null;
    const leftValue = sort === 'price' ? leftPrice?.amount : Number.parseFloat(leftPrice?.unitPrice ?? '');
    const rightValue = sort === 'price' ? rightPrice?.amount : Number.parseFloat(rightPrice?.unitPrice ?? '');
    const safeLeft = leftPrice?.available && typeof leftValue === 'number' && Number.isFinite(leftValue) ? leftValue : Number.POSITIVE_INFINITY;
    const safeRight = rightPrice?.available && typeof rightValue === 'number' && Number.isFinite(rightValue) ? rightValue : Number.POSITIVE_INFINITY;
    return safeLeft - safeRight || left.index - right.index;
  }).map(({ product }) => product);
  const results = allResults.slice((page - 1) * pageSize, page * pageSize);
  const pagination = { page, pageSize, total: allResults.length, hasNext: page * pageSize < allResults.length, hasPrevious: page > 1, nextPage: page * pageSize < allResults.length ? page + 1 : null, previousPage: page > 1 ? page - 1 : null };
  return NextResponse.json({ status: allResults.length ? 'ready' : 'no_results', pagination, category: category || null, sort: sort === 'unitPrice' ? 'unit' : sort, results: results.map((product) => {
    const price = requestedStoreId ? priceContract(getPrice(product, requestedStoreId)) : null;
    return { id: product.id, barcode: product.barcode, name: product.name, brand: product.brand, size: product.size, category: product.category, tag: product.tag, icon: product.icon, aliases: product.aliases, imageUrl: product.imageUrl, imageAlt: product.imageAlt, promotions: product.promotions, price, trustState: price?.trustState ?? 'unknown', availabilityState: price?.availabilityState ?? 'unknown', freshness: price?.freshness ?? { state: 'unknown', checkedAt: null, label: 'checked-at unknown' } };
  }), page, pageSize, total: allResults.length, hasMore: page * pageSize < allResults.length, storeId: requestedStoreId, query, freshness: 'הנתונים עודכנו היום', coverage: requestedStoreId ? getCatalogBranchCoverage(products, catalogStores).find((coverage) => coverage.storeId === requestedStoreId) ?? null : null, catalog: catalogCompleteness, directory: directory.completeness }, { headers: noStoreHeaders });
}
