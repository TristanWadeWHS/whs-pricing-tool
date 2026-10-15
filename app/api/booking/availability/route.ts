import { z } from 'zod';
import { bookingContext, website } from '../../../lib/ai-booking';
import { smallJson } from '../../../lib/estimate-access';
import { ArchiveError } from '../../../lib/estimate-store';
export const runtime='nodejs';
const shape=z.object({token:z.string().min(1).max(111000),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
export async function POST(req:Request) {
  try {const data=shape.parse(await smallJson(req,128*1024));await bookingContext(req,data.token);
    const response=await website('/api/integrations/ai-pricer/availability',{date:data.date});
    const result=await response.json();return Response.json(result,{status:response.status,headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:'Available times could not be loaded. Please retry or call WHS.'},{status:e instanceof ArchiveError?e.status:503,headers:{'Cache-Control':'no-store'}});}
}
