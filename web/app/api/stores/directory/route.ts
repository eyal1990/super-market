import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/api';
import { loadStoreDirectory } from '@/lib/store-directory';

export async function GET(request: Request) {
  const limited = rateLimit(request, 'store-directory');
  if (limited) return limited;
  const url = new URL(request.url);
  const city = url.searchParams.get('city')?.trim().toLocaleLowerCase('he-IL');
  const chain = url.searchParams.get('chain')?.trim().toLocaleLowerCase('en-US');
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50));
  const directory = await loadStoreDirectory();
  const filtered = directory.entries.filter((entry) => entry.isActive)
    .filter((entry) => !city || entry.city.toLocaleLowerCase('he-IL') === city)
    .filter((entry) => !chain || entry.chainId.toLocaleLowerCase('en-US') === chain);
  const start = (page - 1) * pageSize;
  return NextResponse.json({
    stores: filtered.slice(start, start + pageSize),
    page,
    pageSize,
    total: filtered.length,
    hasMore: start + pageSize < filtered.length,
    completeness: directory.completeness,
  }, { headers: { 'cache-control': 'no-store' } });
}
