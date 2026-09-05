import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runHistoricalSchemaV2Migration } = require('../app/lib/google-sheets-schema-v2.ts');

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes('--apply'),
    backupTitle: valueAfter(argv, '--backup-title')
  };
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runHistoricalSchemaV2Migration({
    mode: args.apply ? 'apply' : 'dry-run',
    backupTitle: args.backupTitle
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'blocked') process.exitCode = 1;
}

main().catch(() => {
  console.error(JSON.stringify({
    status: 'blocked',
    blockedReason: 'Historical schema-v2 migration failed before safe aggregate output could be produced.',
    sheetModified: false,
    secretValuesPrinted: false,
    rawRowsPrinted: false
  }));
  process.exitCode = 1;
});
