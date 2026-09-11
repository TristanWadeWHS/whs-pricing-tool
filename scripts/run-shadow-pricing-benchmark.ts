import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { readShadowBenchmarkRows, runShadowPricingBenchmark } = require('../app/lib/shadow-pricing-benchmark.ts');
const { historicalDiagnostics } = require('../app/lib/shadow-historical-adapter.ts');

async function main() {
  const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const credentialBytes = process.env.BENCHMARK_CREDENTIAL_FILE ? readFileSync(process.env.BENCHMARK_CREDENTIAL_FILE) : null;
  const env = { ...process.env };
  if (credentialBytes) env.GOOGLE_SERVICE_ACCOUNT_JSON = credentialBytes.toString('utf8');
  let rows;
  let retrievalCounts;
  try {
    rows = await readShadowBenchmarkRows(env, (counts) => { retrievalCounts = counts; });
  } finally {
    credentialBytes?.fill(0);
    delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }
  let result;
  try {
    // No quote-time provenance is verified for the authorized historical dataset.
    // Descriptive analysis never calls a model fitter as a substitute.
    result = process.argv.includes('--descriptive-only')
      ? { status: 'ok', benchmarkStatus: 'BENCHMARK_BLOCKED_PROVENANCE', decision: 'NO_MODEL_READY', retrievalCounts,
          sourceCode: codeCommit + (dirty ? '+working-tree-price-segments-v1' : ''), historical: historicalDiagnostics(rows) }
      : runShadowPricingBenchmark(rows, codeCommit + (dirty ? '+working-tree-methodology-v2' : ''));
  } finally {
    for (const row of rows) for (const key of Object.keys(row)) delete row[key];
    rows.length = 0;
  }

  console.log(JSON.stringify({
    ...result,
    status: result.status,
    blockedReason: result.blockedReason,
    manifest: result.manifest,
    dataset: result.dataset,
    evaluation: result.evaluation,
    privacy: result.privacy,
    readOnlyScope: true,
    sheetModified: false,
    secretValuesPrinted: false,
    rawRowsPrinted: false,
    rowPredictionsPrinted: false
  }, null, 2));

  if (result.status === 'blocked') process.exitCode = 1;
}

main().catch(() => {
  console.error(JSON.stringify({
    status: 'blocked',
    blockedReason: 'Read-only benchmark failed. No automatic retry; raw provider errors are suppressed.',
    readOnlyScope: true,
    sheetModified: false,
    secretValuesPrinted: false,
    rawRowsPrinted: false,
    rowPredictionsPrinted: false
  }));
  process.exitCode = 1;
});
