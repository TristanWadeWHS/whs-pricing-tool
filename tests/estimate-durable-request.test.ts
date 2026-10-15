import { it, expect, vi, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
const local=vi.hoisted(()=>({db:undefined as PGlite|undefined,parse:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('openai',()=>({default:vi.fn(function(){return {responses:{parse:local.parse}};})}));
vi.mock('../app/lib/estimate-photos',()=>({archiveAnalysisPhotos:vi.fn()}));
vi.mock('postgres',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {readFile}=await import('node:fs/promises');
  const actual=await vi.importActual<{default:typeof import('postgres')}>('postgres');
  // Use the installed driver's real JSON serializer. PGlite alone accepts already
  // encoded strings and misses the JSONB parameter serialization done by Postgres.js.
  const serializers=actual.default('postgres://synthetic:synthetic@localhost/unused').options.serializers;
  local.db=new PGlite();await local.db.exec(await readFile('db/estimate-history.sql','utf8'));
  return {default:()=>({unsafe:async(q:string,v:unknown[])=>{
    const values=[...v],positions=q.includes('pricer_reserve(')?[4]:q.includes('pricer_finish(')?[4,5,6]:[];
    for(const i of positions) if(!q.includes(`$${i+1}::text::jsonb`)) values[i]=serializers[3802](values[i]);
    return (await local.db!.query(q,values)).rows;
  }})};
});
import { EstimateStore } from '../app/lib/estimate-store';
import { newVisitorCookie,VISITOR_COOKIE } from '../app/lib/estimate-access';
import { POST } from '../app/api/conversation/route';
import { sampleAnalysis,pngBytes } from './helpers';
afterAll(async()=>{vi.unstubAllEnvs();await local.db?.close();});
it('persists actual SQL state through a confirmed-scope clarification turn',async()=>{
  for(const [key,value] of Object.entries({PRICER_HISTORY_ENABLED:'true',PRICER_DATABASE_URL:'synthetic',PRICER_VISITOR_SECRET:'synthetic-secret-with-at-least-32-characters',BLOB_READ_WRITE_TOKEN:'synthetic',PRICER_BLOB_PRIVATE_CONFIRMED:'true',OPENAI_API_KEY:'synthetic'}))vi.stubEnv(key,value);
  const cookie=newVisitorCookie(),id=randomUUID();await new EstimateStore().create(cookie.id,id);
  await new EstimateStore().saveInquiry(cookie.id,id,{phone:'+12025550100',email:'synthetic@example.test',services:['mixed junk']});
  const evidence='Two closed synthetic boxes have contents that affect flattening.';
  const model={overlapUnresolved:false,items:[{id:'i_boxes',label:'Synthetic boxes',room:'Synthetic',photoRefs:[1],duplicateOf:null}],analysis:sampleAnalysis({observedFacts:[evidence]}),pricedItemIds:[] as string[],questions:[] as unknown[],conflicts:[],scopeChanges:[],loadedGroups:[] as unknown[]};
  const turn=async(revision:number,actions:unknown[])=>{
    const form=new FormData();form.set('submission',JSON.stringify({message:'Synthetic',room:'Synthetic',services:['mixed junk'],photoRooms:['Synthetic'],actions,answers:[]}));
    form.set('history',JSON.stringify({estimateId:id,requestId:randomUUID(),revision}));form.append('photos',new File([pngBytes()],'synthetic.png',{type:'image/png'}));
    return POST(new Request('https://synthetic.test/api/conversation',{method:'POST',headers:{origin:'https://synthetic.test',cookie:`${VISITOR_COOKIE}=${cookie.value}`},body:form}));
  };
  local.parse.mockResolvedValue({output_parsed:model});expect((await turn(0,[])).status).toBe(200);
  const stored=await new EstimateStore().job(cookie.id,id);expect(stored.state?.items[0].choice).toBe('unresolved');
  local.parse.mockResolvedValue({output_parsed:{...model,pricedItemIds:['i_boxes'],questions:[{itemId:'i_boxes',topic:'contents',text:'Are the boxes empty?',evidence,photoRef:1,impact:'volume',volumeEffect:'Empty boxes flatten and reduce packed volume.'}],loadedGroups:[{itemIds:['i_boxes'],photoRefs:[1],quantityDescription:'Two synthetic boxes',evidence,lowCubicYards:1,highCubicYards:2,packingAssumptions:['Keep closed boxes intact.'],uncertainty:'Contents affect flattening.',handlingConcern:null,answerIds:[]}]}});
  const second=await turn(1,[{id:'i_boxes',choice:'included'}]);expect(second.status).toBe(200);
  const data=await second.json();expect(data.baseline).toBeNull();expect(data.questions).toHaveLength(1);
});
