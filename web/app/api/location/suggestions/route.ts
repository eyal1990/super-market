import { NextResponse } from 'next/server';
import { getAddressSuggestions } from '@/lib/address-directory';
import { rateLimit } from '@/lib/api';
import { validateAddressQuery } from '@/lib/data';

const noStoreHeaders = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  const limited = rateLimit(request, 'location-suggestions', 120);
  if (limited) return limited;
  const rawQuery = new URL(request.url).searchParams.get('q') ?? '';
  const validation = validateAddressQuery(rawQuery);
  if (!validation.valid) return NextResponse.json({ suggestions: [], error: validation.error, code: validation.code }, { status: 400, headers: noStoreHeaders });
  return NextResponse.json({ suggestions: getAddressSuggestions(validation.query) }, { headers: noStoreHeaders });
}
