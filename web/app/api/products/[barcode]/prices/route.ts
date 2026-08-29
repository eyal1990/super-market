import { NextResponse } from 'next/server';
import { getPrice, products, stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';

export async function GET(_request: Request, { params }: { params: Promise<{ barcode: string }> }) {
  const limited = rateLimit(_request, 'product-prices'); if (limited) return limited;
  const { barcode } = await params;
  const product = products.find((item) => item.barcode === barcode);
  if (!product) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 });
  return NextResponse.json({ product: { id: product.id, barcode: product.barcode, name: product.name }, prices: stores.map((store) => ({ store, price: getPrice(product, store.id) })), promotions: product.promotions });
}
