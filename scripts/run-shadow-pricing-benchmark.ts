import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { readShadowBenchmarkRows, runShadowPricingBenchmark } = require('../app/lib/shadow-pricing-benchmark.ts');

async function main() {
  const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const credentialBytes = process.env.BENCHMARK_CREDENTIAL_FILE ? readFileSync(process.env.BENCHMARK_CREDENTIAL_FILE) : null;
  const env = { ...process.env };
  if (credentialBytes) env.GOOGLE_SERVICE_ACCOUNT_JSON = credentialBytes.toString('utf8');
  let rows;
  try {
    rows = await readShadowBenchmarkRows(env);
  } finally {
    credentialBytes?.fill(0);
    delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }
  let result;
  try {
    result = runShadowPricingBenchmark(rows, codeCommit + (dirty ? '+working-tree-methodology-v2' : ''));
  } finally {
    for (const row of rows) for (const key of Object.keys(row)) delete row[key];
    rows.length = 0;
  }

  console.log(JSON.stringify({
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
