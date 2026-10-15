import { z } from 'zod';
import { boundedBridgeBody, verifyBridge } from '../../../lib/ai-booking-bridge';
import { EstimateStore } from '../../../lib/estimate-store';
import { staffPhoto } from '../../../lib/estimate-photos';
export const runtime='nodejs';
export async function POST(req:Request) {
  try {const raw=await boundedBridgeBody(req);if(!verifyBridge(req,raw))return new Response(null,{status:401});
    const data=z.object({estimateId:z.uuid(),requestId:z.uuid(),photoId:z.uuid()}).strict().parse(JSON.parse(raw));
    const store=new EstimateStore();const [attempt]=await store.sql<{record:{photos:{id:string}[]}}>('SELECT record FROM pricer_events WHERE estimate_id=$1 AND event_key=$2',[data.estimateId,`booking-attempt:${data.requestId}`]);
    if(!attempt?.record.photos.some(p=>p.id===data.photoId))return new Response(null,{status:404});
    return await staffPhoto(store,data.estimateId,data.photoId,'analysis');
  }catch{return new Response(null,{status:503});}
}
