import 'server-only';
import { z } from 'zod';
import { EstimateStore, ArchiveError } from './estimate-store';
import { historyEnabled, visitor, requireSameOrigin } from './estimate-access';
import { readConversation } from './conversation-state';
import { bridgeEnabled, bridgeFetch, configuredOrigin, type AiBookingPayload } from './ai-booking-bridge';
export const bookingInput=z.object({name:z.string().trim().min(1).max(100),
  address:z.object({street:z.string().trim().min(1).max(240),city:z.string().trim().min(1).max(120),state:z.string().trim().regex(/^[A-Z]{2}$/),zip:z.string().regex(/^\d{5}(?:-\d{4})?$/),accessNotes:z.string().trim().max(800)}).strict(),
  notes:z.string().trim().max(1000), requestedSlot:z.object({start:z.iso.datetime(),end:z.iso.datetime(),label:z.string().min(1).max(160)}).strict()}).strict();
export async function bookingContext(req:Request,token:string) {
  requireSameOrigin(req);
  if(!historyEnabled()||!bridgeEnabled())throw new ArchiveError('booking_disabled',503);
  const v=visitor(req),state=readConversation(token);
  if(!v||state.historyVisitorId!==v||!state.historyEstimateId)throw new ArchiveError('session_required',401);
  const store=new EstimateStore(),job=await store.job(v,state.historyEstimateId);
  if(job.revision!==state.turn||!job.state?.completedEstimate||job.state.questions.length||job.state.items.some(i=>i.choice==='unresolved'))throw new ArchiveError('estimate_changed',409);
  return {store,v,job,state:job.state};
}
export async function website(path:string,body:unknown) {
  return bridgeFetch(configuredOrigin('WHS_BOOKING_ORIGIN'),path,body,process.env.WHS_BOOKING_PREVIEW_BYPASS);
}
export async function prepareBooking(ctx:Awaited<ReturnType<typeof bookingContext>>,requestId:string,input:z.infer<typeof bookingInput>) {
  const {store,v,job,state}=ctx;
  const inquiry=await store.inquiry(v,job.id),original=await store.originalQuote(job.id);
  if(!original)throw new ArchiveError('quote_required',409);
  const services=new Set<AiBookingPayload['services'][number]>();
  for(const s of state.services) {
    if(s==='demo debris')services.add('Light Demolition');
    else if(s==='storage relocation')services.add('Storage / Relocation');
    else if(['mixed junk','furniture','appliances','cardboard only','concrete / dirt / heavy debris'].includes(s))services.add('Junk Removal');
    else throw new ArchiveError('unknown_service',409);
  }
  const photos=(await store.photos(job.id)).filter(p=>p.variant==='analysis'&&p.status==='complete'&&p.ordinal<=state.photoHashes.length).sort((a,b)=>a.ordinal-b.ordinal);
  if(photos.length!==state.photoHashes.length)throw new ArchiveError('photo_incomplete',409);
  const payload:AiBookingPayload={estimateId:job.id,requestId,quoteRevision:job.revision,originalQuote:JSON.stringify(original),
    selectedServices:state.services,services:[...services],customer:{name:input.name,email:inquiry.email,phone:inquiry.phone},
    address:input.address,notes:input.notes,requestedSlot:input.requestedSlot,
    projectDescription:state.messages.map(m=>m.text).filter(Boolean).join('\n\n'),confirmedScope:state.items.filter(i=>i.choice==='included').map(i=>i.label),
    photos:photos.map(p=>({id:p.photo_id,size:Number(p.bytes),contentType:p.content_type}))};
  // A retry reuses its immutable payload, even if the response was lost.
  const key=`booking-attempt:${requestId}`;
  await store.sql('INSERT INTO pricer_events(estimate_id,event_key,record) VALUES($1,$2,$3::text::jsonb) ON CONFLICT DO NOTHING',[job.id,key,JSON.stringify(payload)]);
  const [saved]=await store.sql<{record:AiBookingPayload}>('SELECT record FROM pricer_events WHERE estimate_id=$1 AND event_key=$2',[job.id,key]);
  if(JSON.stringify(saved.record)!==JSON.stringify(payload)) {
    // PostgreSQL jsonb reorders keys: compare canonicalized objects via SQL.
    const [same]=await store.sql<{same:boolean}>('SELECT record=$3::text::jsonb AS same FROM pricer_events WHERE estimate_id=$1 AND event_key=$2',[job.id,key,JSON.stringify(payload)]);
    if(!same.same)throw new ArchiveError('booking_retry_conflict',409);
  }
  return saved.record;
}
