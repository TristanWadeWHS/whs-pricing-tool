import { z } from 'zod';
import { bookingContext,bookingInput,prepareBooking,website } from '../../../lib/ai-booking';
import { smallJson } from '../../../lib/estimate-access';
import { ArchiveError } from '../../../lib/estimate-store';
import { verifiedBookingReceipt } from '../../../lib/booking-receipt';
export const runtime='nodejs';
export const maxDuration=120;
const shape=z.object({token:z.string().min(1).max(111000),requestId:z.uuid(),details:bookingInput,confirmed:z.literal(true)}).strict();
export async function POST(req:Request) {
  try {const data=shape.parse(await smallJson(req,128*1024)),ctx=await bookingContext(req,data.token);
    const [saved]=await ctx.store.sql<{record:unknown}>("SELECT record FROM pricer_events WHERE estimate_id=$1 AND event_key='booking-result'",[ctx.job.id]);
    if(saved)return Response.json(verifiedBookingReceipt(saved.record,ctx.job.id,data.requestId),{headers:{'Cache-Control':'no-store'}});
    const payload=await prepareBooking(ctx,data.requestId,data.details);
    const response=await website('/api/integrations/ai-pricer/submit',payload),result=await response.json();
    if(response.ok && result.ok===true && typeof result.leadId==='string' && result.pending===true) {
      const receipt=verifiedBookingReceipt(result,ctx.job.id,data.requestId);
      await ctx.store.sql("INSERT INTO pricer_events(estimate_id,event_key,record) VALUES($1,'booking-result',$2::text::jsonb) ON CONFLICT DO NOTHING",[ctx.job.id,JSON.stringify(receipt)]);
      await ctx.store.sql('UPDATE pricer_estimates SET booking_job_id=$2,updated_at=now() WHERE id=$1',[ctx.job.id,result.leadId]);
      return Response.json(receipt,{headers:{'Cache-Control':'no-store'}});
    }
    return Response.json({error:result.error||result.message||'Your request could not be confirmed. Retry with the same details.',unavailable:result.unavailable===true},{status:response.ok?503:response.status,headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:e instanceof z.ZodError?'Check your name, address and requested time.':'Your request could not be confirmed. Your details are retained; retry to check the same request.'},{status:e instanceof ArchiveError?e.status:e instanceof z.ZodError?400:503,headers:{'Cache-Control':'no-store'}});}
}
