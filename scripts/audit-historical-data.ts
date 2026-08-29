import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { readHistoricalSheetAudit } = require('../app/lib/google-sheets-audit.ts');

function loadLocalEnv(path = '.env.local') {
  try {
    const contents = readFileSync(resolve(process.cwd(), path), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      if (!process.env[key]) {
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // Missing local env files are reported by the audit as key-presence statuses.
  }
}

function safeAuditOutput(audit: Awaited<ReturnType<typeof readHistoricalSheetAudit>>) {
  if (audit.blockedReason) {
    return {
      status: 'blocked',
      config: audit.config,
      blockedReason: audit.blockedReason,
      readOnlyScope: true,
      sheetModified: false,
      secretValuesPrinted: false
    };
  }

  return {
    status: 'ok',
    config: audit.config,
    source: audit.source,
    schema: audit.schema,
    quality: audit.quality,
    outcomeAvailability: audit.outcomeAvailability,
    privacy: audit.privacy,
    targets: audit.targets,
    readiness: audit.readiness,
    snapshotManifest: audit.snapshotManifest,
    readOnlyScope: true,
    sheetModified: false,
    secretValuesPrinted: false
  };
}

async function main() {
  loadLocalEnv();
  const codeCommit = process.env.AUDIT_CODE_COMMIT || 'local-worktree';
  const audit = await readHistoricalSheetAudit(process.env, codeCommit);
  console.log(JSON.stringify(safeAuditOutput(audit), null, 2));
  if (audit.blockedReason) process.exitCode = 1;
}

main().catch(() => {
  console.error(JSON.stringify({
    status: 'blocked',
    blockedReason: 'Historical-data audit failed before safe aggregate output could be produced.',
    secretValuesPrinted: false,
    sheetModified: false
  }));
  process.exitCode = 1;
});
