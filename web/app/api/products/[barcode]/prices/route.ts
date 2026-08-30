import { NextResponse } from 'next/server';
import { getPrice, stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';
import { loadStoreDirectory, storesFromDirectory } from '@/lib/store-directory';
import { priceContract } from '@/lib/shopping';
import { loadRuntimeCatalog } from '@/lib/catalog-runtime';

const noStoreHeaders = { 'cache-control': 'no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ barcode: string }> }) {
  const limited = rateLimit(_request, 'product-prices'); if (limited) return limited;
  const { barcode } = await params;
  const catalog = await loadRuntimeCatalog();
  const product = catalog.products.find((item) => item.barcode === barcode);
  if (!product) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 });
  const directory = await loadStoreDirectory();
  const catalogStores = storesFromDirectory(stores, directory.entries);
  const url = new URL(_request.url);
  const requestedStoreId = url.searchParams.get('storeId');
  if (requestedStoreId && !catalogStores.some((store) => store.id === requestedStoreId)) return NextResponse.json({ error: 'unknown_store', code: 'invalid_store' }, { status: 400, headers: noStoreHeaders });
  const selectedStores = requestedStoreId ? catalogStores.filter((store) => store.id === requestedStoreId) : catalogStores;
  return NextResponse.json({ status: 'ready', selectedStoreId: requestedStoreId ?? null, product: { id: product.id, barcode: product.barcode, name: product.name, imageUrl: product.imageUrl, imageAlt: product.imageAlt }, prices: selectedStores.map((store) => { const price = priceContract(getPrice(product, store.id)); return { store, price, trustState: price.trustState, availabilityState: price.availabilityState, freshness: price.freshness }; }), promotions: product.promotions, catalog: catalog.completeness, catalogSource: catalog.source, fallbackUsed: catalog.fallbackUsed, warnings: catalog.warnings, directory: directory.completeness }, { headers: noStoreHeaders });
}
