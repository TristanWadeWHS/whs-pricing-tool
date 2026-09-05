import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readShadowBenchmarkRows, runShadowPricingBenchmark } = require('../app/lib/shadow-pricing-benchmark.ts');

async function main() {
  const codeCommit = process.env.BENCHMARK_CODE_COMMIT || 'local-worktree';
  const rows = await readShadowBenchmarkRows(process.env);
  const result = runShadowPricingBenchmark(rows, codeCommit);

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

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'blocked',
    blockedReason: error instanceof Error ? error.message : 'Shadow pricing benchmark failed before aggregate output.',
    readOnlyScope: true,
    sheetModified: false,
    secretValuesPrinted: false,
    rawRowsPrinted: false,
    rowPredictionsPrinted: false
  }));
  process.exitCode = 1;
});
