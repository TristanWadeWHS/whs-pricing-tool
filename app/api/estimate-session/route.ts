import { NextResponse } from 'next/server';
import { historyEnabled, historyConfigured, newVisitorCookie, visitor, VISITOR_COOKIE, UUID, requireSameOrigin, smallJson } from '../../lib/estimate-access';
import { EstimateStore } from '../../lib/estimate-store';
export const runtime='nodejs';
export async function POST(req:Request) {
  try {
    requireSameOrigin(req);
    if(!historyEnabled())return NextResponse.json({enabled:false},{headers:{'Cache-Control':'no-store'}});
    if(!historyConfigured())return NextResponse.json({error:'Private estimate storage is not configured. Your entries are retained.'},{status:503,headers:{'Cache-Control':'no-store'}});
    const body=await smallJson(req); if(!UUID.test(body.id))throw new Error('Invalid ID.');
    const known=visitor(req), fresh=known?null:newVisitorCookie();
    const job=await new EstimateStore().create(known??fresh!.id,body.id);
    const response=NextResponse.json({enabled:true,id:job.id},{headers:{'Cache-Control':'no-store'}});
    if(fresh)response.cookies.set(VISITOR_COOKIE,fresh.value,{secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge:365*86400});
    return response;
  }catch{return NextResponse.json({error:'Estimate storage is unavailable. Please retry; your entries are retained.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
