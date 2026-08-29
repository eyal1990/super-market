import { NextResponse } from 'next/server';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const windowMs = 60_000;

export function rateLimit(request: Request, scope: string, max = 90) {
  const now = Date.now();
  const identity = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? 'anonymous';
  const key = `${scope}:${identity}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 2_000) for (const [entryKey, entry] of buckets) if (entry.resetAt <= now) buckets.delete(entryKey);
  if (bucket.count <= max) return null;
  return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429, headers: { 'retry-after': '60' } });
}
