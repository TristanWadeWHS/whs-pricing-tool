import { it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import sharp from 'sharp';
import { head, get } from '@vercel/blob';
import { NextRequest } from 'next/server';
import { applyHistoryMigration, verifyPreviewTarget } from './history-preview-setup';
vi.mock('server-only',()=>({}));
const parse=vi.hoisted(()=>vi.fn());
// Only this isolated verifier mocks analysis. No deployed mock route or provider fallback.
vi.mock('openai',()=>({default:vi.fn(function(){return {responses:{parse}};})}));
import { POST as session } from '../app/api/estimate-session/route';
import { POST as upload } from '../app/api/estimate-photos/route';
import { POST as conversation } from '../app/api/conversation/route';
import { GET as history } from '../app/api/estimate-history/route';
import { GET as photo } from '../app/api/estimate-history/photo/route';
import { proxy } from '../proxy';
import { sampleAnalysis } from '../tests/helpers';
import { photoPath } from '../app/lib/estimate-photos';
import type { ConversationModel, ConversationResult } from '../app/lib/conversation-schema';

it('explicit authorized Preview storage setup and isolated synthetic verification',async()=>{
  let stage='configuration';
  let db:ReturnType<typeof postgres>|undefined;
  try {
    const target=verifyPreviewTarget(process.env);
    // Require OIDC, not an unnoticed static credential taking precedence.
    assert(!process.env.BLOB_READ_WRITE_TOKEN);
    stage='database_connection';
    db=postgres(process.env.PRICER_DATABASE_URL!,{ssl:'require',max:1,connect_timeout:10,idle_timeout:5,onnotice:()=>{}});
    const [identity]=await db`SELECT current_database() AS name`;
    assert.equal(identity.name,target.database);
    stage='database_migration';
    const source=await readFile(new URL('../db/estimate-history.sql',import.meta.url),'utf8');
    const migration=await db.begin(tx=>applyHistoryMigration(async(q,v=[])=>await tx.unsafe(q,v as never[]) as unknown as Record<string,unknown>[],source,target.identity,process.env.VERCEL_GIT_COMMIT_SHA!));
    console.log(`PRICER_VERIFY database=${migration} target=dedicated-configured-neon`);
    // Process-local flag only, after successful schema setup. Shared Preview stays disabled.
    vi.stubEnv('PRICER_HISTORY_ENABLED','true');
    vi.stubEnv('OPENAI_API_KEY','synthetic-no-provider-access');
    const origin='https://synthetic-preview.test',id=randomUUID();
    const staff={authorization:`Bearer ${process.env.INTERNAL_ACCESS_TOKEN}`};
    stage='session';
    const created=await session(new Request(origin+'/api/estimate-session',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({id})}));
    assert.equal(created.status,200);
    const cookie=created.headers.get('set-cookie')!.split(';')[0];
    const headers={origin,cookie,...staff};
    const buffers:Buffer[]=[];
    const ids:string[]=[];
    for(let ordinal=1;ordinal<=2;ordinal++) {
      const bytes=await sharp({create:{width:64,height:64,channels:3,background:ordinal===1?'#008040':'#204080'}}).png().toBuffer();
      buffers.push(bytes);const photoId=randomUUID();ids.push(photoId);
      const metadata={estimateId:id,photoId,ordinal,mime:'image/png',bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')};
      const send=(action:string)=>upload(new Request(origin+'/api/estimate-photos',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({...metadata,action})}));
      stage='blob_oidc_signed_upload';
      const auth=await send('authorize');assert.equal(auth.status,200);
      const grant=await auth.json();assert.equal(typeof grant.presignedUrl,'string');
      const put=await fetch(grant.presignedUrl,{method:'PUT',headers:{'Content-Type':'image/png'},body:Uint8Array.from(bytes),redirect:'error'});
      assert(put.ok);
      stage='blob_private_receipt';
      assert.equal((await send('complete')).status,200);
      const path=photoPath(id,photoId,'original'),metadataHead=await head(path);
      assert(new URL(metadataHead.url).hostname.endsWith('.private.blob.vercel-storage.com'));
      assert.equal((await send('authorize')).status,200);
      stage='blob_private_read';
      const retrieved=await get(path,{access:'private'});assert(retrieved?.statusCode===200);
      assert(Buffer.from(await new Response(retrieved.stream).arrayBuffer()).equals(bytes));
      const denied=await fetch(metadataHead.url,{redirect:'manual'});assert([401,403,404].includes(denied.status));
    }
    console.log('PRICER_VERIFY blob=private-put-head-get-pass oidc=pass anonymous-read=denied originals=2');
    const evidence='Two closed synthetic boxes have contents that affect flattening.';
    const model:ConversationModel={overlapUnresolved:false,items:[{id:'i_boxes',label:'Synthetic boxes',room:'Synthetic',photoRefs:[1,2],duplicateOf:null}],analysis:sampleAnalysis({observedFacts:[evidence]}),pricedItemIds:[],questions:[],conflicts:[],scopeChanges:[],loadedGroups:[]};
    const base={message:'Synthetic verification only',room:'Synthetic',services:['mixed junk'],photoRooms:['Synthetic','Synthetic'],actions:[] as {id:string;choice:string}[],answers:[] as {id:string;text:string;notSure:boolean}[]};
    async function turn(revision:number,submission:typeof base,requestId:string,token?:string) {
      const form=new FormData();form.set('submission',JSON.stringify(submission));form.set('history',JSON.stringify({estimateId:id,requestId,revision}));if(token)form.set('token',token);
      for(const bytes of buffers)form.append('photos',new File([Uint8Array.from(bytes)],'synthetic.png',{type:'image/png'}));
      const response=await conversation(new Request(origin+'/api/conversation',{method:'POST',headers,body:form}));
      assert.equal(response.status,200);
      return await response.json() as ConversationResult;
    }
    stage='saved_analysis';parse.mockResolvedValue({output_parsed:model});
    const first=await turn(0,base,randomUUID());assert.equal(first.baseline,null);
    stage='clarification_revision';
    const scoped={...base,actions:[{id:'i_boxes',choice:'included'}]};
    parse.mockResolvedValue({output_parsed:{...model,pricedItemIds:['i_boxes'],questions:[{itemId:'i_boxes',topic:'contents',text:'Are the boxes empty?',evidence,photoRef:1,impact:'volume',volumeEffect:'Empty boxes flatten and reduce packed volume.'}],loadedGroups:[{itemIds:['i_boxes'],photoRefs:[1,2],quantityDescription:'Two synthetic boxes',evidence,lowCubicYards:1,highCubicYards:2,packingAssumptions:['Keep closed boxes intact.'],uncertainty:'Contents affect flattening.',handlingConcern:null,answerIds:[]}]}});
    const second=await turn(1,scoped,randomUUID(),first.token);assert.equal(second.baseline,null);assert.equal(second.questions.length,1);
    const answered={...base,answers:[{id:second.questions[0].id,text:'Lightweight contents; keep boxes intact.',notSure:false}]};
    const requestId=randomUUID();
    parse.mockResolvedValue({output_parsed:{...model,pricedItemIds:['i_boxes'],loadedGroups:[{itemIds:['i_boxes'],photoRefs:[1,2],quantityDescription:'Two synthetic boxes',evidence,lowCubicYards:1,highCubicYards:2,packingAssumptions:['Keep confirmed filled boxes intact.'],uncertainty:'Visual size range.',handlingConcern:null,answerIds:[second.questions[0].id]}]}});
    const third=await turn(2,answered,requestId,second.token);assert(third.baseline);
    stage='retry_idempotency';
    const calls=parse.mock.calls.length,retry=await turn(2,answered,requestId,second.token);
    assert.equal(parse.mock.calls.length,calls);assert.deepEqual(retry.baseline,third.baseline);
    stage='staff_history';
    assert.equal(proxy(new NextRequest(origin+'/owner/history',{headers:staff})).status,200);
    assert.notEqual(proxy(new NextRequest(origin+'/owner/history')).status,200);
    const url=origin+'/api/estimate-history?id='+id;
    assert.equal((await history(new Request(url))).status,403);
    const detail=await history(new Request(url,{headers:staff}));assert.equal(detail.status,200);assert.match(detail.headers.get('cache-control')!,/no-store/);
    const saved=await detail.json();assert.equal(saved.revisions.length,3);assert.equal(saved.photos.length,4);
    assert.deepEqual(saved.photos.map((p:{ordinal:number;variant:string})=>[p.ordinal,p.variant]),[[1,'analysis'],[1,'original'],[2,'analysis'],[2,'original']]);
    assert.equal(saved.revisions[0].record.state.answers[0].text,answered.answers[0].text);
    for(let i=0;i<ids.length;i++) for(const variant of ['original','analysis']) {
      const purl=origin+`/api/estimate-history/photo?id=${id}&photo=${ids[i]}&variant=${variant}`;
      assert.equal((await photo(new Request(purl))).status,403);
      const response=await photo(new Request(purl,{headers:staff}));assert.equal(response.status,200);assert(Buffer.from(await response.arrayBuffer()).equals(buffers[i]));
    }
    console.log(`PRICER_VERIFY PASS synthetic_estimate=${id} revisions=3 originals=2 optimized=2 idempotency=pass staff-handlers=pass analysis=mocked`);
  } catch {
    // SDK/SQL/assertion errors can carry connection strings or signed URLs. Never emit them.
    throw new Error(`PRICER_VERIFY_BLOCKED stage=${stage}; no sensitive error details emitted`);
  } finally {vi.unstubAllEnvs();await db?.end({timeout:5});}
});
