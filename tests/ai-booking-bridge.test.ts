import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
import {bridgeHeaders,verifyBridge,configuredOrigin} from '../app/lib/ai-booking-bridge';
import {bookingInput,prepareBooking,bookingContext} from '../app/lib/ai-booking';
import {EstimateStore} from '../app/lib/estimate-store';
import {newVisitorCookie,VISITOR_COOKIE} from '../app/lib/estimate-access';
import {signConversation} from '../app/lib/conversation-state';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
function enabled(){vi.stubEnv('PRICER_BOOKING_ENABLED','true');vi.stubEnv('AI_PRICER_BRIDGE_SECRET','synthetic-bridge-key-at-least-32-characters');}
describe('AI booking handoff',()=>{
 it('authenticates exact body, endpoint and timestamp; rejects tampering, expiry and disabled handoff',()=>{
  enabled();const body='{"date":"2026-10-20"}',path='/api/test',now=1792100000000;
  const headers=bridgeHeaders(path,body,now),req=new Request(`https://website.test${path}`,{method:'POST',headers,body});
  expect(verifyBridge(req,body,now)).toBe(true);
  expect(verifyBridge(req,body+' ',now)).toBe(false);
  expect(verifyBridge(new Request('https://website.test/api/other',{headers}),body,now)).toBe(false);
  expect(verifyBridge(req,body,now+60001)).toBe(false);
  vi.stubEnv('PRICER_BOOKING_ENABLED','false');expect(verifyBridge(req,body,now)).toBe(false);
 });
 it('rejects unconfigured origins and invalid booking details',()=>{
  expect(()=>configuredOrigin('WHS_BOOKING_ORIGIN')).toThrow();
  vi.stubEnv('WHS_BOOKING_ORIGIN','https://website.test/path');expect(()=>configuredOrigin('WHS_BOOKING_ORIGIN')).toThrow();
  expect(bookingInput.safeParse({name:' ',address:{},notes:'',requestedSlot:{}}).success).toBe(false);
 });
 it('saves immutable attempt with server contacts, service mappings, original quote and ordered private photo IDs',async()=>{
  enabled();const db=new PGlite();await db.exec(readFileSync('db/estimate-history.sql','utf8'));
  const sql=async<T extends Record<string,unknown>>(text:string,values:unknown[]=[]) => (await db.query<T>(text,values)).rows;
  const store=new EstimateStore(sql),id=randomUUID(),v=randomUUID();await store.create(v,id);
  await store.saveInquiry(v,id,{phone:'+12025550100',email:'synthetic@example.test',services:['furniture','demo debris','storage relocation']});
  await sql('INSERT INTO pricer_revisions(estimate_id,revision,request_id,record) VALUES($1,1,$2,$3::text::jsonb)',[id,randomUUID(),JSON.stringify({displayed:{amount:'$330'},result:{baseline:{low:330}},versions:{pricing:'synthetic'}})]);
  const state:any={version:1,turn:1,expires:Date.now()+60000,services:['furniture','demo debris','storage relocation'],messages:[{text:'Remove the old furniture.',room:''}],items:[{label:'Sofa',choice:'included'},{label:'Table',choice:'excluded'}],questions:[],photoHashes:[],completedEstimate:{percent:60,rangeText:'',exceptional:false}};
  const photoIds=[randomUUID(),randomUUID()];
  for(let n=0;n<2;n++)for(const variant of ['original','analysis']) {
    await store.photo(v,id,{photo_id:photoIds[n],ordinal:n+1,variant:variant as 'original'|'analysis',pathname:`pricer-estimates/v1/${id}/${photoIds[n]}/${variant}`,content_type:'image/jpeg',bytes:5,declared_hash:'a'.repeat(64),status:'complete',tokens:0});
  }
  await sql("UPDATE pricer_photos SET status='complete' WHERE estimate_id=$1",[id]);state.photoHashes=['a'.repeat(64),'a'.repeat(64)];
  const ctx:any={store,v,job:{id,revision:1},state};const request=randomUUID();
  const input={name:'Synthetic Customer',address:{street:'1 Test St',city:'Irvine',state:'CA',zip:'92618',accessNotes:''},notes:'Gate access available',requestedSlot:{start:'2026-11-01T18:00:00.000Z',end:'2026-11-01T19:00:00.000Z',label:'Synthetic time'}};
  const payload=await prepareBooking(ctx,request,input);
  expect(payload.photos.map(p=>p.id)).toEqual(photoIds);
  expect(payload.customer.email).toBe('synthetic@example.test');expect(payload.services).toEqual(['Junk Removal','Light Demolition','Storage / Relocation']);
  expect(payload.confirmedScope).toEqual(['Sofa']);expect(payload.projectDescription).toBe('Remove the old furniture.');expect(JSON.parse(payload.originalQuote).displayed.amount).toBe('$330');
  expect(await prepareBooking(ctx,request,input)).toEqual(payload);
  await expect(prepareBooking(ctx,request,{...input,name:'Changed'})).rejects.toThrow();
  expect((await sql('SELECT * FROM pricer_events WHERE event_key=$1',[`booking-attempt:${request}`])).length).toBe(1);
  await db.close();
 });
 it('blocks missing visitor, cross-origin and unfinished scope before sending anything',async()=>{
  enabled();vi.stubEnv('PRICER_HISTORY_ENABLED','true');vi.stubEnv('PRICER_VISITOR_SECRET','synthetic-visitor-secret-at-least-32-characters');
  const req=new Request('https://pricer.test/api/booking/request',{headers:{origin:'https://evil.test'}});
  await expect(bookingContext(req,'invalid')).rejects.toThrow('Cross-origin');
  vi.stubEnv('OPENAI_API_KEY','synthetic-signing-secret');
  const cookie=newVisitorCookie(),id=randomUUID();
  const state:any={version:1,expires:Date.now()+60000,turn:1,historyEstimateId:id,historyVisitorId:cookie.id,messages:[],services:['furniture'],photoHashes:[],photoRooms:[],items:[],questions:[],answers:[]};
  const token=signConversation(state);
  await expect(bookingContext(new Request('https://pricer.test/api/booking/request',{headers:{origin:'https://pricer.test'}}),token)).rejects.toMatchObject({status:401});
  vi.spyOn(EstimateStore.prototype,'job').mockResolvedValue({id,visitor_id:cookie.id,revision:1,state,analyzed:true,status:'draft'});
  await expect(bookingContext(new Request('https://pricer.test/api/booking/request',{headers:{origin:'https://pricer.test',cookie:`${VISITOR_COOKIE}=${cookie.value}`}}),token)).rejects.toMatchObject({status:409});
 });
});
