import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/api';
import { buildIngestionStatus } from './status-contract';

const noStoreHeaders = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  const limited = rateLimit(request, 'ingestion-status');
  if (limited) return limited;

  return NextResponse.json(buildIngestionStatus(), { headers: noStoreHeaders });
}
