vi.mock('server-only',()=>({}));
import { describe, it, expect, vi, afterEach } from 'vitest';
import { clarificationDraft } from '../app/lib/clarification-draft';
import type { ScopeItem, Question } from '../app/lib/conversation-schema';
const items:ScopeItem[]=[{id:'i_sofa',label:'Sofa',room:'Living room',photoRefs:[1],choice:'unresolved'},{id:'i_box',label:'Box',room:'Living room',photoRefs:[1],choice:'included'}];
const questions:Question[]=[{id:'i_box:contents',itemId:'i_box',topic:'contents',text:'What is inside?',photoRef:1,evidence:'Closed box.',impact:'volume',volumeEffect:'Confirm loaded size.'}];
describe('combined clarification submission',()=>{
 it('carries pending scope choices and typed answers in the same submission',()=>{
  expect(clarificationDraft(items,questions,{'i_sofa':'included','i_box':'included'},{'i_box:contents':{text:'  Empty and can be flattened.  ',notSure:false}})).toEqual({actions:[{id:'i_sofa',choice:'included'},{id:'i_box',choice:'included'}],answers:[{id:'i_box:contents',text:'Empty and can be flattened.',notSure:false}]});
 });
 it('keeps blank answers pending without manufacturing Not sure',()=>{
  expect(clarificationDraft(items,questions,{'i_sofa':'included'},{'i_box:contents':{text:' ',notSure:false}}).answers).toEqual([]);
 });
 it('preserves explicit Not sure and drops irrelevant questions for items just excluded',()=>{
  expect(clarificationDraft(items,questions,{}, {'i_box:contents':{text:'old text',notSure:true}}).answers).toEqual([{id:'i_box:contents',text:'',notSure:true}]);
  expect(clarificationDraft(items,questions,{'i_box':'excluded'},{'i_box:contents':{text:'Not needed',notSure:false}}).answers).toEqual([]);
 });
});

it('reports disabled booking explicitly without querying availability or claiming a full day',async()=>{
  vi.stubEnv('PRICER_HISTORY_ENABLED','true');vi.stubEnv('PRICER_BOOKING_ENABLED','false');
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const {POST}=await import('../app/api/booking/availability/route');
  const response=await POST(new Request('https://pricer.test/api/booking/availability',{method:'POST',headers:{origin:'https://pricer.test','content-type':'application/json'},body:JSON.stringify({token:'synthetic',date:'2026-10-16'})}));
  expect(response.status).toBe(503);const body=await response.json();
  expect(body.code).toBe('booking_disabled');expect(body.error).toContain('not enabled in this Preview');
  expect(body.slots).toBeUndefined();expect(fetcher).not.toHaveBeenCalled();
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
