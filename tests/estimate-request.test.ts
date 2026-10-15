import { afterEach,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
const parse=vi.hoisted(()=>vi.fn());
vi.mock('openai',()=>({default:vi.fn(function(){return {responses:{parse}};})}));
vi.mock('../app/lib/estimate-photos',()=>({archiveAnalysisPhotos:vi.fn()}));
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { POST } from '../app/api/conversation/route';
import { EstimateStore,ArchiveError } from '../app/lib/estimate-store';
import { newVisitorCookie,VISITOR_COOKIE } from '../app/lib/estimate-access';
import { archiveAnalysisPhotos } from '../app/lib/estimate-photos';
import { pngBytes,sampleAnalysis } from './helpers';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.clearAllMocks();});
function configure(){
  for(const [k,v] of Object.entries({PRICER_HISTORY_ENABLED:'true',PRICER_DATABASE_URL:'synthetic',PRICER_VISITOR_SECRET:'synthetic-visitor-secret-at-least-32-characters',BLOB_READ_WRITE_TOKEN:'synthetic',PRICER_BLOB_PRIVATE_CONFIRMED:'true',OPENAI_API_KEY:'synthetic',INTERNAL_ACCESS_TOKEN:'synthetic'}))vi.stubEnv(k,v);
}
async function request(){
  vi.spyOn(EstimateStore.prototype,'inquiry').mockResolvedValue({phone:'+12025550100',email:'synthetic@example.test',services:['mixed junk']});
  vi.spyOn(EstimateStore.prototype,'setInquiryServices').mockResolvedValue();
  configure();const cookie=newVisitorCookie(),id=crypto.randomUUID();
  vi.spyOn(EstimateStore.prototype,'job').mockResolvedValue({id,visitor_id:cookie.id,revision:0,state:null,analyzed:false,status:'draft'});
  const form=new FormData();
  form.set('submission',JSON.stringify({message:'  Synthetic boxes please.  ',room:'Garage',services:['mixed junk'],photoRooms:['Garage'],actions:[],answers:[]}));
  form.set('history',JSON.stringify({estimateId:id,requestId:crypto.randomUUID(),revision:0}));
  form.append('photos',new File([pngBytes()],'synthetic.png',{type:'image/png'}));
  const encoded=new Response(form),headers=new Headers(encoded.headers);headers.set('origin','https://synthetic.test');headers.set('cookie',`${VISITOR_COOKIE}=${cookie.value}`);
  return new Request('https://synthetic.test/api/conversation',{method:'POST',headers,body:await encoded.arrayBuffer()});
}
it('blocks a fourth request before provider calls or photo storage',async()=>{
  const req=await request();vi.spyOn(EstimateStore.prototype,'reserve').mockRejectedValue(new ArchiveError('daily_limit',429));
  const response=await POST(req);expect(response.status).toBe(429);expect((await response.json()).errorCategory).toBe('daily_limit');
  expect(parse).not.toHaveBeenCalled();expect(archiveAnalysisPhotos).not.toHaveBeenCalled();
});
it('requires private contact capture before analysis and never calls providers for an incomplete inquiry',async()=>{
  const req=await request();vi.mocked(EstimateStore.prototype.inquiry).mockRejectedValue(new ArchiveError('contact_required',409));
  const response=await POST(req);expect(response.status).toBe(409);
  expect((await response.json()).baseline).toBeNull();expect(parse).not.toHaveBeenCalled();expect(archiveAnalysisPhotos).not.toHaveBeenCalled();
});
it('archives exact submission, ordered photos, structured analysis and template before returning success',async()=>{
  const req=await request();vi.spyOn(EstimateStore.prototype,'reserve').mockResolvedValue({lease:crypto.randomUUID()});
  const save=vi.spyOn(EstimateStore.prototype,'finish').mockResolvedValue();
  const analysis={overlapUnresolved:false,items:[{id:'i_box',label:'Synthetic box',room:'Garage',photoRefs:[1],duplicateOf:null}],analysis:sampleAnalysis(),pricedItemIds:[],questions:[],conflicts:[],scopeChanges:[],loadedGroups:[]};
  parse.mockResolvedValue({output_parsed:analysis});
  const response=await POST(req);expect(response.status).toBe(200);expect((await response.json()).archiveRevision).toBe(1);
  expect(archiveAnalysisPhotos).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][4]).toMatchObject({submission:{message:'  Synthetic boxes please.  '},photoHashes:[expect.stringMatching(/^[a-f0-9]{64}$/)]});
  expect(save.mock.calls[0][7]).toEqual(analysis);expect(save.mock.calls[0][8]).toContain('Analyze removal photos, not prices.');
  expect(JSON.stringify(save.mock.calls[0])).not.toContain('data:image');
});
it('releases a failed analysis with a sanitized category and no fabricated price',async()=>{
  const req=await request();vi.spyOn(EstimateStore.prototype,'reserve').mockResolvedValue({lease:crypto.randomUUID()});
  const fail=vi.spyOn(EstimateStore.prototype,'fail').mockResolvedValue();parse.mockRejectedValue(new Error('Do not persist provider internals'));
  const response=await POST(req);expect(response.status).toBe(502);expect((await response.json()).baseline).toBeNull();
  expect(fail.mock.calls[0][4]).toBe('analysis_or_storage_failure');
});
it('public opt-in fails closed without configured storage/staff identity; history stays protected',()=>{
  vi.stubEnv('PRICER_PUBLIC_CUSTOMERS_ENABLED','true');
  expect(proxy(new NextRequest('https://synthetic.test/')).status).toBe(503);
  configure();vi.stubEnv('PRICER_INTERNAL_AUTH_IS_STAFF','true');
  expect(proxy(new NextRequest('https://synthetic.test/')).status).toBe(200);
  expect(proxy(new NextRequest('https://synthetic.test/api/estimate-history')).status).toBe(401);
  expect(proxy(new NextRequest('https://synthetic.test/api/conversation',{method:'POST',headers:{origin:'https://untrusted.test'}})).status).toBe(403);
});
