import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { applyHistoryMigration, verifyPreviewTarget, checksum } from '../scripts/history-preview-setup';
const source=await readFile(new URL('../db/estimate-history.sql',import.meta.url),'utf8');
it('applies once transactionally and preserves existing records on repeated setup',async()=>{
  const db=new PGlite();
  const run=(text=source)=>db.transaction(tx=>applyHistoryMigration(async(q,v)=>v ? (await tx.query<Record<string,unknown>>(q,v)).rows : ((await tx.exec(q)).at(-1)?.rows??[]) as Record<string,unknown>[],text,'synthetic-target','synthetic-commit'));
  try {
    expect(await run()).toBe('applied');
    await db.query("INSERT INTO pricer_visitors VALUES('00000000-0000-4000-8000-000000000001')");
    expect(await run()).toBe('already_applied');
    expect((await db.query('SELECT id FROM pricer_visitors')).rows).toHaveLength(1);
    await expect(run(source+'\n-- changed')).rejects.toThrow('existing_migration_requires_review');
  } finally {await db.close();}
});
it('refuses existing unmanaged schema without changing it',async()=>{
  const db=new PGlite();
  try {
    await db.exec('CREATE TABLE existing_data(id integer)');
    await expect(db.transaction(tx=>applyHistoryMigration(async(q,v)=>(await tx.query<Record<string,unknown>>(q,v)).rows,source,'target','commit'))).rejects.toThrow('existing_schema_requires_review');
    expect((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows).toEqual([{table_name:'existing_data'}]);
  } finally {await db.close();}
});
it('fails closed outside the approved Preview and normalizes platform line endings',()=>{
  expect(()=>verifyPreviewTarget({VERCEL_ENV:'production'})).toThrow('preview_configuration_guard');
  expect(()=>verifyPreviewTarget({})).toThrow('preview_configuration_guard');
  expect(checksum('a\r\nb')).toBe(checksum('a\nb'));
});
