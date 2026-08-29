import { NextResponse } from 'next/server';
import { findAddressResults } from '@/lib/data';
import { rateLimit } from '@/lib/api';

export async function GET(request: Request) {
  const limited = rateLimit(request, 'location-search'); if (limited) return limited;
  const query = new URL(request.url).searchParams.get('q') ?? '';
  if (query.length > 120) return NextResponse.json({ error: 'כתובת ארוכה מדי' }, { status: 400 });
  return NextResponse.json({ results: findAddressResults(query), privacy: 'הכתובת משמשת לחיפוש הנוכחי בלבד ואינה נשמרת.' });
}
