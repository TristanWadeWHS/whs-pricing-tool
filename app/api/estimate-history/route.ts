import { NextResponse } from 'next/server';
import { verifiedStaff, historyConfigured, UUID } from '../../lib/estimate-access';
import { EstimateStore } from '../../lib/estimate-store';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request) {
  if(!verifiedStaff(req))return reply({error:'Verified staff access is required. The shared login must be configured as staff-only before history is enabled.'},403);
  if(!historyConfigured())return reply({error:'Private estimate history is not configured.'},503);
  try {
    const p=new URL(req.url).searchParams,store=new EstimateStore(),id=p.get('id');
    if(id) {
      if(!UUID.test(id))return reply({error:'Not found.'},404);
      const [estimate]=await store.sql('SELECT id,status,created_at,updated_at,revision,customer_id,accepted_quote_id,booking_job_id,final_completed_price,actual_loads,completion_date,scope_change_reason FROM pricer_estimates WHERE id=$1',[id]);
      if(!estimate)return reply({error:'Not found.'},404);
      const before=Number(p.get('before')??2147483647); if(!Number.isInteger(before)||before<1)throw new Error();
      const revisions=await store.sql('SELECT revision,created_at,record FROM pricer_revisions WHERE estimate_id=$1 AND revision<$2 ORDER BY revision DESC LIMIT 10',[id,before]);
      const failures=await store.sql('SELECT category,created_at FROM pricer_failures WHERE estimate_id=$1 ORDER BY id DESC LIMIT 20',[id]);
      const events=await store.sql('SELECT record,created_at FROM pricer_events WHERE estimate_id=$1 ORDER BY created_at DESC LIMIT 48',[id]);
      const photos=(await store.photos(id)).map(({pathname:_,declared_hash:__,...photo})=>photo);
      return reply({estimate,revisions,failures,events,photos,originalQuote:await store.originalQuote(id),nextBefore:revisions.length===10?revisions.at(-1)!.revision:null});
    }
    const cursor=p.get('before')??'9999-01-01T00:00:00.000Z',cursorId=p.get('cursorId')??'ffffffff-ffff-4fff-bfff-ffffffffffff';
    if(!Number.isFinite(Date.parse(cursor))||!UUID.test(cursorId))throw new Error();
    const estimates=await store.sql('SELECT id,status,created_at,updated_at,revision FROM pricer_estimates WHERE (created_at,id)<($1::timestamptz,$2::uuid) ORDER BY created_at DESC,id DESC LIMIT 20',[cursor,cursorId]);
    return reply({estimates,next:estimates.length===20?{before:estimates.at(-1)!.created_at,cursorId:estimates.at(-1)!.id}:null});
  }catch{return reply({error:'History could not be loaded. Please retry.'},503);}
}
