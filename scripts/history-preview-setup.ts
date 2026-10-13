import { createHash } from 'node:crypto';

export type SetupQuery = (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
const version = 'estimate-history-v1';
export const checksum = (value: string) => createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');

export function verifyPreviewTarget(env: Record<string,string|undefined>) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_PROJECT_ID !== 'prj_jzzxkDJnnDt2Bu0HiJvwpmrwThPU' ||
      env.VERCEL_GIT_COMMIT_REF !== 'codex/estimate-history-allowance' ||
      env.PRICER_PUBLIC_CUSTOMERS_ENABLED !== 'false' || env.PRICER_DAILY_LIMIT_ENABLED !== 'false' ||
      env.PRICER_INTERNAL_AUTH_IS_STAFF !== 'true' || env.PRICER_BLOB_PRIVATE_CONFIRMED !== 'true' ||
      !env.INTERNAL_ACCESS_TOKEN || (env.PRICER_VISITOR_SECRET?.length ?? 0) < 32 ||
      env.PRICER_VISITOR_SECRET === env.INTERNAL_ACCESS_TOKEN || !env.BLOB_STORE_ID || !env.VERCEL_OIDC_TOKEN) {
    throw new Error('preview_configuration_guard');
  }
  const target = new URL(env.PRICER_DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname.endsWith('.neon.tech') ||
      !target.username || !target.password || target.pathname.length < 2) throw new Error('database_target_guard');
  return { database: decodeURIComponent(target.pathname.slice(1)), identity: checksum(target.hostname + target.pathname) };
}

// The caller must provide one transaction. Never infer migration success from table names alone.
export async function applyHistoryMigration(sql: SetupQuery, source: string, identity: string, commit: string) {
  await sql("SELECT pg_advisory_xact_lock(221013)");
  const tables = await sql("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  const names = tables.map(row => row.table_name);
  const hash = checksum(source);
  if (names.includes('pricer_migration_ledger')) {
    const rows = await sql('SELECT checksum,target_identity FROM pricer_migration_ledger WHERE version=$1', [version]);
    if (rows.length !== 1 || rows[0].checksum !== hash || rows[0].target_identity !== identity ||
        !['pricer_visitors','pricer_days','pricer_estimates','pricer_events','pricer_requests','pricer_failures','pricer_revisions','pricer_photos'].every(n => names.includes(n))) {
      throw new Error('existing_migration_requires_review');
    }
    return 'already_applied';
  }
  const functions = await sql("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')");
  if (names.length || functions.length) throw new Error('existing_schema_requires_review');
  await sql(source);
  await sql('CREATE TABLE pricer_migration_ledger (version text PRIMARY KEY, checksum text NOT NULL, target_identity text NOT NULL, source_commit text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  await sql('INSERT INTO pricer_migration_ledger(version,checksum,target_identity,source_commit) VALUES($1,$2,$3,$4)', [version,hash,identity,commit]);
  return 'applied';
}
