import { NextResponse } from 'next/server';
import { historyConfigured,verifiedStaff,requireSameOrigin,smallJson } from '../../../lib/estimate-access';
import { EstimateStore } from '../../../lib/estimate-store';
import { cleanupOrphans } from '../../../lib/estimate-cleanup';
export const runtime='nodejs';
export async function POST(req:Request) {
  const headers={'Cache-Control':'private, no-store'};
  if(!verifiedStaff(req))return NextResponse.json({error:'Staff access required.'},{status:403,headers});
  try {
    requireSameOrigin(req);
    const body=await smallJson(req,128);
    if(!historyConfigured()||!body||typeof body.apply!=='boolean'||Object.keys(body).length!==1)throw new Error('Invalid request.');
    return NextResponse.json(await cleanupOrphans(new EstimateStore(),body.apply),{headers});
  }catch{return NextResponse.json({error:'Maintenance unavailable. No historical records are deleted by this operation.'},{status:503,headers});}
}
