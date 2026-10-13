import {afterEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@vercel/blob',()=>({issueSignedToken:vi.fn(),presignUrl:vi.fn(),head:vi.fn(),get:vi.fn(),put:vi.fn()}));
import {issueSignedToken,presignUrl,head} from '@vercel/blob';
import {POST} from '../app/api/estimate-photos/route';
import {historyConfigured,newVisitorCookie,VISITOR_COOKIE} from '../app/lib/estimate-access';
import {EstimateStore,type Query} from '../app/lib/estimate-store';
import {photoPath} from '../app/lib/estimate-photos';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.clearAllMocks();});
function configure(){
  for(const [key,value] of Object.entries({PRICER_HISTORY_ENABLED:'true',PRICER_DATABASE_URL:'synthetic',PRICER_VISITOR_SECRET:'synthetic-independent-secret-at-least-32-characters',PRICER_BLOB_PRIVATE_CONFIRMED:'true',BLOB_STORE_ID:'store_synthetic',VERCEL_OIDC_TOKEN:'synthetic-oidc',BLOB_READ_WRITE_TOKEN:''}))vi.stubEnv(key,value);
}
function request(){
  configure();const estimateId=crypto.randomUUID(),photoId=crypto.randomUUID(),cookie=newVisitorCookie();
  const row={photo_id:photoId,ordinal:1,variant:'original' as const,pathname:photoPath(estimateId,photoId,'original'),content_type:'image/jpeg',bytes:10,declared_hash:'a'.repeat(64),status:'pending',tokens:0};
  vi.spyOn(EstimateStore.prototype,'photo').mockResolvedValue(row);
  vi.spyOn(EstimateStore.prototype,'photos').mockResolvedValue([row]);
  // Calls after authentication are isolated from the actual database.
  vi.spyOn(EstimateStore.prototype,'job').mockResolvedValue({id:estimateId,visitor_id:cookie.id,revision:0,state:null,analyzed:false,status:'draft'});
  const req=new Request('https://synthetic.test/api/estimate-photos',{method:'POST',headers:{origin:'https://synthetic.test',cookie:`${VISITOR_COOKIE}=${cookie.value}`,'Content-Type':'application/json'},body:JSON.stringify({estimateId,photoId,ordinal:1,mime:'image/jpeg',bytes:10,hash:row.declared_hash,action:'authorize'})});
  return {req,row};
}
it('requires credentials as well as a store ID; webhook public key does not authorize storage',()=>{
  configure();expect(historyConfigured()).toBe(true);
  vi.stubEnv('VERCEL_OIDC_TOKEN','');vi.stubEnv('BLOB_WEBHOOK_PUBLIC_KEY','synthetic-public-key');expect(historyConfigured()).toBe(false);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN','synthetic-explicit-token');expect(historyConfigured()).toBe(true);
});
it('issues only a short-lived private PUT URL scoped to the exact photo, type and size',async()=>{
  const {req,row}=request();
  const mockSql=vi.fn(async()=>[{photo_id:row.photo_id}]) as unknown as Query;
  // Constructor uses the exported query; replace only the DB module client, never credentials.
  databaseQuery.mockImplementation(mockSql);
  vi.mocked(head).mockRejectedValue(new Error('Synthetic missing object'));
  vi.mocked(issueSignedToken).mockResolvedValue({delegationToken:'server-only-delegation',clientSigningToken:'server-only-signing',validUntil:Date.now()+300000});
  vi.mocked(presignUrl).mockResolvedValue({presignedUrl:'https://synthetic.invalid/one-put'});
  const response=await POST(req),body=await response.json();expect(response.status).toBe(200);
  expect(body).toEqual({presignedUrl:'https://synthetic.invalid/one-put'});
  expect(issueSignedToken).toHaveBeenCalledWith({pathname:row.pathname,operations:['put'],allowedContentTypes:['image/jpeg'],maximumSizeInBytes:10,validUntil:expect.any(Number)});
  expect(vi.mocked(issueSignedToken).mock.calls[0][0].validUntil! - Date.now()).toBeLessThanOrEqual(300000);
  expect(presignUrl).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({operation:'put',pathname:row.pathname,access:'private',allowOverwrite:false,addRandomSuffix:false,maximumSizeInBytes:10}));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(body)).not.toMatch(/server-only|synthetic-oidc/);
});
const databaseQuery=vi.hoisted(()=>vi.fn());
vi.mock('postgres',()=>({default:()=>({unsafe:(...args:unknown[])=>databaseQuery(...args)})}));
it('fails closed on OIDC authorization denial without returning credentials or a usable upload URL',async()=>{
  const {req}=request();databaseQuery.mockResolvedValue([{photo_id:'synthetic'}]);
  vi.mocked(head).mockRejectedValue(new Error('Synthetic missing object'));
  vi.mocked(issueSignedToken).mockRejectedValue(new Error('secret-provider-diagnostic'));
  const response=await POST(req),body=await response.json();expect(response.status).toBe(503);
  expect(body.presignedUrl).toBeUndefined();expect(JSON.stringify(body)).not.toContain('secret-provider-diagnostic');
  expect(presignUrl).not.toHaveBeenCalled();
});
