type DemoRetailerStatus = {
  id: string;
  name: string;
  status: 'unknown';
  lastSuccessfulRun: null;
  documents: null;
  warnings: null;
  failures: null;
};

export type IngestionStatusResponse = {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'demo';
  overallStatus: 'unavailable';
  telemetry: {
    live: false;
    persistence: 'none';
  };
  message: string;
  retailers: DemoRetailerStatus[];
  policy: {
    staleAfterHours: number;
    partialRunsKeepPreviousData: true;
  };
};

/**
 * Builds the public observability contract for the current demo deployment.
 * `generatedAt` describes only when this response was created. It is not an
 * ingestion-run timestamp and must not be used as freshness evidence.
 */
export function buildIngestionStatus(now = new Date()): IngestionStatusResponse {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    mode: 'demo',
    overallStatus: 'unavailable',
    telemetry: {
      live: false,
      persistence: 'none',
    },
    message: 'לא הוגדר מאגר מתמשך לנתוני הקליטה; מצב הריצות אינו ידוע.',
    retailers: [
      {
        id: 'cerberus',
        name: 'מקורות קמעונאיים (Cerberus)',
        status: 'unknown',
        lastSuccessfulRun: null,
        documents: null,
        warnings: null,
        failures: null,
      },
      {
        id: 'shufersal',
        name: 'שופרסל',
        status: 'unknown',
        lastSuccessfulRun: null,
        documents: null,
        warnings: null,
        failures: null,
      },
    ],
    policy: {
      staleAfterHours: 24,
      partialRunsKeepPreviousData: true,
    },
  };
}
