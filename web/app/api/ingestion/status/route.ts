import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/api';

export async function GET(request: Request) {
  const limited = rateLimit(request, 'ingestion-status'); if (limited) return limited;
  return NextResponse.json({
    generatedAt: '2026-08-30T08:20:00+03:00',
    retailers: [
      { id: 'cerberus', name: 'מקורות Cerberus', status: 'healthy', lastSuccessfulRun: '2026-08-30T08:18:00+03:00', documents: 42, warnings: 1, failures: 0 },
      { id: 'shufersal', name: 'שופרסל', status: 'healthy', lastSuccessfulRun: '2026-08-30T07:55:00+03:00', documents: 12, warnings: 0, failures: 0 },
    ],
    policy: { staleAfterHours: 24, partialRunsKeepPreviousData: true },
  });
}
