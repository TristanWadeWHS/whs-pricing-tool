import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { readReferenceRecords } from '../app/lib/historical-reference-data';

// Explicit opt-in only; normal tests never read credentials or call Google.
it.skipIf(process.env.AUTHORIZED_REFERENCE_READ !== '1')('single authorized bounded source check', async () => {
  const bytes = readFileSync(process.env.REFERENCE_CREDENTIAL_FILE!);
  const env = { GOOGLE_SPREADSHEET_ID: '1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI', GOOGLE_SHEET_TAB: 'ML Data',
    GOOGLE_SERVICE_ACCOUNT_JSON: bytes.toString('utf8') };
  let records: Awaited<ReturnType<typeof readReferenceRecords>> = [];
  try {
    records = await readReferenceRecords(env);
    process.stdout.write(JSON.stringify({ status: 'READ_VERIFIED', nonemptyRecords: records.length,
      pricedRecords: records.filter((r) => r.completedPrice !== null).length,
      projectedLoadsPresent: records.filter((r) => r.scope.projectedLoads !== null).length,
      stairsPresent: records.filter((r) => r.scope.stairs !== null).length,
      heavyMaterialsPresent: records.filter((r) => r.scope.heavyMaterials !== null).length,
      demolitionPresent: records.filter((r) => r.scope.demolition !== null).length,
      verifiedSharedLoadUnits: 0, verifiedScopeGroups: 0, decision: 'NO_MODEL_READY' }) + '\n');
  } finally {
    records.length = 0; bytes.fill(0); delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }
}, 15000);
