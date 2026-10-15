import { beforeAll,afterAll,afterEach,it,expect,vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
vi.mock('server-only',()=>({}));
import { inquirySchema } from '../app/lib/inquiry-schema';
import { EstimateStore,type Query } from '../app/lib/estimate-store';
import { ArchiveSession } from '../app/lib/estimate-archive-client';
import { POST } from '../app/api/estimate-session/route';
import { newVisitorCookie,VISITOR_COOKIE } from '../app/lib/estimate-access';
const db=new PGlite();
const sql:Query=async <T extends Record<string,unknown>>(q:string,v:unknown[]=[]) => (await db.query<T>(q,v)).rows;
const store=new EstimateStore(sql);
const contact={phone:'+12025550100',email:'synthetic@example.test',services:['mixed junk']};
beforeAll(async()=>{await db.exec(await readFile('db/estimate-history.sql','utf8'));});
afterAll(async()=>{await db.close();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('requires both valid contacts and supported, distinct service selections',()=>{
  expect(inquirySchema.parse({...contact,phone:'(202) 555-0100'}).phone).toBe(contact.phone);
  for(const change of [{phone:''},{email:''},{phone:'abc2025550100'},{phone:'1234567890'},{email:'invalid'},{services:[]},{services:['invented']},{services:['mixed junk','mixed junk']},{price:1}])expect(inquirySchema.safeParse({...contact,...change}).success).toBe(false);
});
it('stores one private inquiry, retains services, rejects other visitors and preserves original contact on retry',async()=>{
  const id=randomUUID(),v=randomUUID();await store.create(v,id);
  await expect(store.inquiry(v,id)).rejects.toMatchObject({category:'contact_required'});
  await store.saveInquiry(v,id,contact);await store.saveInquiry(v,id,contact);
  await store.setInquiryServices(v,id,['mixed junk','furniture']);
  expect(await store.inquiry(v,id)).toMatchObject({...contact,services:['mixed junk','furniture'],kind:'inquiry'});
  expect((await sql('SELECT * FROM pricer_events WHERE estimate_id=$1',[id])).length).toBe(1);
  await expect(store.inquiry(randomUUID(),id)).rejects.toMatchObject({category:'not_found'});
  await expect(store.saveInquiry(v,id,{...contact,email:'changed@example.test'})).rejects.toMatchObject({category:'contact_conflict'});
  expect((await store.inquiry(v,id)).email).toBe(contact.email);
  expect((await store.job(v,id)).state).toBeNull();
});
it('validates API capture, returns no contacts, rejects cross-origin input and keeps ownership',async()=>{
  for(const [k,v] of Object.entries({PRICER_HISTORY_ENABLED:'true',PRICER_DATABASE_URL:'synthetic',PRICER_VISITOR_SECRET:'synthetic-secret-with-at-least-32-characters',BLOB_READ_WRITE_TOKEN:'synthetic',PRICER_BLOB_PRIVATE_CONFIRMED:'true'}))vi.stubEnv(k,v);
  // Bind methods to the test SQL without recursively invoking the prototype spy.
  vi.spyOn(EstimateStore.prototype,'job').mockImplementation(async(v,id)=>{
    const [row]=await sql<any>('SELECT * FROM pricer_estimates WHERE id=$1 AND visitor_id=$2',[id,v]);if(!row)throw new Error('not found');return row;
  });
  vi.spyOn(EstimateStore.prototype,'saveInquiry').mockImplementation(async(v,id,input)=>{
    await sql("INSERT INTO pricer_events(estimate_id,event_key,record) VALUES($1,'inquiry',$2::text::jsonb)",[id,JSON.stringify(input)]);
  });
  // create uses the injected SQL via the concrete instance, not another prototype call.
  vi.spyOn(EstimateStore.prototype,'create').mockImplementation(async(v,id)=>{await sql('SELECT pricer_create($1,$2)',[v,id]);return store.job(v,id);});
  const cookie=newVisitorCookie(),id=randomUUID();
  const req=(inquiry:unknown,origin='https://synthetic.test')=>new Request('https://synthetic.test/api/estimate-session',{method:'POST',headers:{origin,cookie:`${VISITOR_COOKIE}=${cookie.value}`,'content-type':'application/json'},body:JSON.stringify({id,inquiry})});
  expect((await POST(req({...contact,email:'bad'}))).status).toBe(400);
  expect((await POST(req(contact,'https://other.test'))).status).toBe(503);
  const response=await POST(req(contact));expect(response.status).toBe(200);
  expect(await response.json()).toEqual({enabled:true,id});expect(response.headers.get('cache-control')).toBe('no-store');
});
it('contact retry reuses one ID and never puts contact in photo multipart or signed context',async()=>{
  const calls:any[]=[];let fail=true;
  vi.stubGlobal('fetch',vi.fn(async(_path,init)=>{const body=JSON.parse(init.body);calls.push(body);if(body.inquiry&&fail){fail=false;return Response.json({error:'Retry'},{status:503});}return Response.json({enabled:true});}));
  const session=new ArchiveSession(),signal=new AbortController().signal;
  await expect(session.capture(contact,signal)).rejects.toThrow('Retry');
  await session.capture(contact,signal);
  const form=new FormData();await session.prepare(form,[],signal);
  expect(new Set(calls.map(c=>c.id)).size).toBe(1);
  expect(String(form.get('history'))).not.toContain(contact.email);
  expect([...form.keys()]).toEqual(['history']);
});
it('keeps the first completed provisional quote separate from subsequent revisions',async()=>{
  const id=randomUUID(),v=randomUUID();await store.create(v,id);
  for(const [revision,amount] of [[1,null],[2,'$330'],[3,'$440']] as const) {
    await sql(`INSERT INTO pricer_revisions(estimate_id,revision,request_id,record) VALUES($1,$2,$3,$4::text::jsonb)`,
      [id,revision,randomUUID(),JSON.stringify({displayed:{amount},result:{baseline:amount?{low:revision===2?330:440}:null},versions:{pricing:'volume-550-v1'}})]);
  }
  expect(await store.originalQuote(id)).toMatchObject({revision:2,displayed:{amount:'$330'},baseline:{low:330}});
});
