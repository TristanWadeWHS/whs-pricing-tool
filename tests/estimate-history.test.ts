import { beforeAll,afterAll,afterEach,describe,it,expect,vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
vi.mock('server-only',()=>({}));
vi.mock('@vercel/blob',()=>({head:vi.fn(),get:vi.fn(),put:vi.fn(),del:vi.fn()}));
import { EstimateStore,type Query } from '../app/lib/estimate-store';
import { newVisitorCookie,visitor,verifiedStaff,VISITOR_COOKIE,allowanceEnabled } from '../app/lib/estimate-access';
import { freshConversation } from '../app/lib/conversation-state';
import { GET as historyGET } from '../app/api/estimate-history/route';
import { GET as photoGET } from '../app/api/estimate-history/photo/route';
import { confirmPhoto,photoPath,privateMetadata } from '../app/lib/estimate-photos';
import { head,del } from '@vercel/blob';
import { cleanupOrphans } from '../app/lib/estimate-cleanup';
const db=new PGlite();
const sql:Query=async <T extends Record<string,unknown>>(text:string,values:unknown[]=[]) => (await db.query<T>(text,values)).rows;
const store=new EstimateStore(sql);
const result={message:'Please confirm scope.',items:[],questions:[],baseline:null,reasons:[],assumptions:[],review:true};
const now=new Date('2026-10-13T19:00:00Z');
beforeAll(async()=>{await db.exec(await readFile(new URL('../db/estimate-history.sql',import.meta.url),'utf8'));});
afterAll(async()=>db.close());
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
function enable(){vi.stubEnv('PRICER_DAILY_LIMIT_ENABLED','true');}
async function job(v=randomUUID()){const id=randomUUID();await store.create(v,id);return {v,id};}
async function attempt(j:{v:string;id:string},t=now,staff=false,revision=0,r=randomUUID()){
 const input={message:'synthetic',revision},reserved=await store.reserve(j.v,j.id,r,revision,input,true,staff,t);return {r,input,reserved};
}
async function finish(j:{v:string;id:string},a:Awaited<ReturnType<typeof attempt>>,t=now){const state=freshConversation(t.getTime());state.turn=1;
 await store.finish(j.v,j.id,a.r,a.reserved.lease!,a.input,state,result,null,'synthetic-template','synthetic',t);}
describe('durable estimate ledger in isolated PostgreSQL',()=>{
 it('charges completion day and carries pending reservations across midnight',async()=>{
  enable();vi.stubEnv('PRICER_DAILY_ALLOWANCE','1');
  const j=await job(),before=new Date('2026-10-14T06:59:50Z'),after=new Date('2026-10-14T07:00:10Z');
  const a=await attempt(j,before);
  await expect(attempt(await job(j.v),after)).rejects.toMatchObject({category:'daily_limit'});
  await finish(j,a,after);
  expect(await sql('SELECT day::text,used FROM pricer_days WHERE visitor_id=$1 ORDER BY day',[j.v])).toEqual([{day:'2026-10-13',used:0},{day:'2026-10-14',used:1}]);
 });
 it('dry-runs then cleans only abandoned unsubmitted private uploads, preserving revision records',async()=>{
  const j=await job(),kept=await job(),pid=randomUUID();
  const metadata={photo_id:pid,ordinal:1,variant:'original' as const,pathname:photoPath(j.id,pid,'original'),content_type:'image/jpeg',bytes:12,declared_hash:'c'.repeat(64),status:'pending',tokens:0};
  await store.photo(j.v,j.id,metadata);await store.photo(kept.v,kept.id,{...metadata,pathname:photoPath(kept.id,pid,'original')});
  await finish(kept,await attempt(kept));
  await sql("UPDATE pricer_estimates SET created_at=now()-interval '8 days' WHERE id IN ($1,$2)",[j.id,kept.id]);
  await sql("UPDATE pricer_photos SET updated_at=now()-interval '8 days' WHERE estimate_id IN ($1,$2)",[j.id,kept.id]);
  expect((await cleanupOrphans(store)).candidateJobs).toBe(1);expect(del).not.toHaveBeenCalled();
  expect((await cleanupOrphans(store,true)).deleted).toBe(1);
  expect(del).toHaveBeenCalledWith(metadata.pathname);
  expect((await store.photos(kept.id))[0].status).toBe('pending');
  await expect(attempt(j)).rejects.toMatchObject({category:'expired_job'});
 });
 it('allows three successful analyses, blocks a fourth, and retains immutable revisions',async()=>{
  enable();const v=randomUUID();let first='';
  for(let n=0;n<3;n++){const j=await job(v);first||=j.id;await finish(j,await attempt(j));}
  await expect(attempt(await job(v))).rejects.toMatchObject({category:'daily_limit',status:429});
  expect((await sql('SELECT used FROM pricer_days WHERE visitor_id=$1',[v]))[0].used).toBe(3);
  expect((await sql('SELECT record FROM pricer_revisions WHERE estimate_id=$1',[first]))[0].record).toMatchObject({outcomes:{customerId:null,finalCompletedPrice:null},versions:{pricing:'volume-550-v1'}});
 });
 it('serializes concurrent reservations so only three jobs can call paid analysis',async()=>{
  enable();const v=randomUUID(),jobs=await Promise.all(Array.from({length:6},()=>job(v)));
  const results=await Promise.allSettled(jobs.map(j=>attempt(j)));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(3);
 });
 it('replays successful retries once, rejects changed payload and stale concurrent requests',async()=>{
  enable();const j=await job(),a=await attempt(j);
  await expect(attempt(j)).rejects.toMatchObject({category:'in_progress'});
  await finish(j,a);
  expect((await attempt(j,now,false,0,a.r)).reserved.cached).toBe(true);
  await expect(store.reserve(j.v,j.id,a.r,0,{changed:true},true,false,now)).rejects.toMatchObject({category:'idempotency_conflict'});
  await expect(attempt(j)).rejects.toMatchObject({category:'stale_revision'});
  expect((await sql('SELECT count(*)::int AS n FROM pricer_revisions WHERE estimate_id=$1',[j.id]))[0].n).toBe(1);
 });
 it('releases failed requests, stores sanitized failures and bounds repeated retries',async()=>{
  enable();const j=await job(),r=randomUUID();
  for(let n=0;n<3;n++){const a=await attempt(j,now,false,0,r);await store.fail(j.v,j.id,r,a.reserved.lease!,'provider_timeout');}
  await expect(attempt(j,now,false,0,r)).rejects.toMatchObject({category:'retry_limit'});
  expect((await sql('SELECT used FROM pricer_days WHERE visitor_id=$1',[j.v]))[0].used).toBe(0);
  expect((await sql('SELECT category FROM pricer_failures WHERE estimate_id=$1',[j.id])).map(x=>x.category)).toEqual(['provider_timeout','provider_timeout','provider_timeout']);
 });
 it('expires abandoned reservations and prevents stale workers from finalizing',async()=>{
  enable();const j=await job(),a=await attempt(j);
  const later=new Date(now.getTime()+181000),again=await attempt(j,later,false,0,a.r);
  await expect(finish(j,a,later)).rejects.toMatchObject({category:'stale_lease'});
  await finish(j,again,later);
 });
 it('does not count clarification as a new estimate and bounds paid revisions',async()=>{
  enable();vi.stubEnv('PRICER_MAX_ANALYSIS_REVISIONS','2');const j=await job();await finish(j,await attempt(j));
  const a=await attempt(j,now,false,1);await finish(j,a);
  expect((await sql('SELECT used FROM pricer_days WHERE visitor_id=$1',[j.v]))[0].used).toBe(1);
  await expect(attempt(j,now,false,2)).rejects.toMatchObject({category:'revision_limit'});
  expect((await sql('SELECT revision FROM pricer_revisions WHERE estimate_id=$1 ORDER BY revision',[j.id])).map(x=>x.revision)).toEqual([1,2]);
 });
 it.each([['2026-03-08T07:59:59Z','2026-03-08T08:00:00Z'],['2026-11-01T06:59:59Z','2026-11-01T07:00:00Z']])('rolls over at Los Angeles midnight across DST season: %s',async(before,after)=>{
  enable();vi.stubEnv('PRICER_DAILY_ALLOWANCE','1');const v=randomUUID(),j=await job(v);await finish(j,await attempt(j,new Date(before)),new Date(before));
  await expect(attempt(await job(v),new Date(before))).rejects.toMatchObject({category:'daily_limit'});
  const next=await job(v);await finish(next,await attempt(next,new Date(after)),new Date(after));
  expect(await sql('SELECT used FROM pricer_days WHERE visitor_id=$1',[v])).toHaveLength(2);
  // Verify actual zone conversion, including DST transition hour, rather than adding 24h.
  const day=await sql("SELECT ($1::timestamptz AT TIME ZONE 'America/Los_Angeles')::date::text AS day",[after]);expect(day[0].day).toBe(after.slice(0,10));
 });
 it('staff exemption is server verified; owner URLs and forged flags are not roles',async()=>{
  vi.stubEnv('INTERNAL_ACCESS_TOKEN','synthetic-staff');vi.stubEnv('PRICER_INTERNAL_AUTH_IS_STAFF','true');
  expect(verifiedStaff(new Request('https://test/owner?staff=true',{headers:{'x-staff':'true'}}))).toBe(false);
  expect(verifiedStaff(new Request('https://test',{headers:{authorization:'Bearer wrong'}}))).toBe(false);
  const staff=verifiedStaff(new Request('https://test',{headers:{authorization:'Bearer synthetic-staff'}}));expect(staff).toBe(true);
  enable();vi.stubEnv('PRICER_DAILY_ALLOWANCE','1');const v=randomUUID(),j=await job(v);await finish(j,await attempt(j));
  await expect(attempt(await job(v),now,staff)).resolves.toBeDefined();
  vi.stubEnv('PRICER_INTERNAL_AUTH_IS_STAFF','false');expect(verifiedStaff(new Request('https://test',{headers:{authorization:'Bearer synthetic-staff'}}))).toBe(false);
 });
 it('visitor identity survives reset/refresh and rejects forged cookies; Preview default disabled',()=>{
  vi.stubEnv('PRICER_VISITOR_SECRET','synthetic-visitor-secret-at-least-32-characters');const c=newVisitorCookie();
  for(const path of ['/','/?reset=true','/owner'])expect(visitor(new Request(`https://test${path}`,{headers:{cookie:`${VISITOR_COOKIE}=${c.value}`}}))).toBe(c.id);
  expect(visitor(new Request('https://test',{headers:{cookie:`${VISITOR_COOKIE}=${c.id}.wrong`}}))).toBeNull();
  vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('PRICER_DAILY_LIMIT_ENABLED','');expect(allowanceEnabled()).toBe(false);
 });
 it('rejects unauthorized record/photo access before touching storage',async()=>{
  expect((await historyGET(new Request('https://test/api/estimate-history?id='+randomUUID()))).status).toBe(403);
  expect((await photoGET(new Request('https://test/api/estimate-history/photo?id='+randomUUID()))).status).toBe(403);
 });
 it('links ordered private originals and records failed/pending/complete receipts idempotently',async()=>{
  const j=await job(),pid=randomUUID();const metadata={photo_id:pid,ordinal:1,variant:'original' as const,pathname:photoPath(j.id,pid,'original'),content_type:'image/jpeg',bytes:12,declared_hash:'a'.repeat(64),status:'pending',tokens:0};
  const row=await store.photo(j.v,j.id,metadata);
  vi.mocked(head).mockRejectedValueOnce(new Error('synthetic'));
  await expect(confirmPhoto(store,j.id,row)).rejects.toMatchObject({category:'photo_incomplete'});
  expect((await store.photos(j.id))[0].status).toBe('failed');
  const receipt={url:`https://test.private.blob.vercel-storage.com/${row.pathname}`,pathname:row.pathname,size:12,contentType:'image/jpeg'};
  expect(privateMetadata({...receipt,url:'https://test.public.blob.vercel-storage.com/photo'},row)).toBe(false);
  vi.mocked(head).mockResolvedValue(receipt as Awaited<ReturnType<typeof head>>);await confirmPhoto(store,j.id,row);
  await store.photo(j.v,j.id,metadata);expect(await store.photos(j.id)).toHaveLength(1);expect((await store.photos(j.id))[0].status).toBe('complete');
  await expect(store.photo(randomUUID(),j.id,metadata)).rejects.toMatchObject({category:'not_found'});
  await expect(store.photo(j.v,j.id,{...metadata,declared_hash:'b'.repeat(64)})).rejects.toMatchObject({category:'photo_conflict'});
 });
});
