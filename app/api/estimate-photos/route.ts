import { NextResponse } from 'next/server';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { z } from 'zod';
import { historyConfigured, visitor, requireSameOrigin, smallJson } from '../../lib/estimate-access';
import { EstimateStore } from '../../lib/estimate-store';
import { ORIGINAL_LIMIT, ORIGINAL_TYPES, photoPath, confirmPhoto } from '../../lib/estimate-photos';
const shape=z.object({estimateId:z.string().uuid(),photoId:z.string().uuid(),ordinal:z.number().int().min(1).max(10),
  mime:z.enum(['image/jpeg','image/png','image/webp','image/heic','image/heif']),bytes:z.number().int().positive().max(ORIGINAL_LIMIT),
  hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.enum(['authorize','complete'])}).strict();
export const runtime='nodejs';
export async function POST(req:Request) {
  try {
    requireSameOrigin(req); if(!historyConfigured())throw new Error('Unconfigured.');
    const v=visitor(req); if(!v)return NextResponse.json({error:'Estimate session required.'},{status:401,headers:{'Cache-Control':'no-store'}});
    const data=shape.parse(await smallJson(req)),store=new EstimateStore();
    await store.inquiry(v,data.estimateId);
    const row=await store.photo(v,data.estimateId,{photo_id:data.photoId,ordinal:data.ordinal,variant:'original',pathname:photoPath(data.estimateId,data.photoId,'original'),
      content_type:data.mime,bytes:data.bytes,declared_hash:data.hash,status:'pending',tokens:0});
    if(data.action==='complete') {
      await confirmPhoto(store,data.estimateId,row);
      return NextResponse.json({complete:true},{headers:{'Cache-Control':'no-store'}});
    }
    if(row.status==='complete')return NextResponse.json({complete:true},{headers:{'Cache-Control':'no-store'}});
    // Receipt recovery before minting another upload token; never overwrite originals.
    try { await confirmPhoto(store,data.estimateId,row); return NextResponse.json({complete:true},{headers:{'Cache-Control':'no-store'}}); } catch { /* An incomplete upload may be retried. */ }
    const allowed=await store.sql('UPDATE pricer_photos SET tokens=tokens+1,updated_at=now() WHERE estimate_id=$1 AND photo_id=$2 AND variant=$3 AND tokens<5 RETURNING photo_id',[data.estimateId,data.photoId,'original']);
    if(!allowed.length)throw new Error('Upload retry limit.');
    const constraints={pathname:row.pathname,allowedContentTypes:[data.mime],maximumSizeInBytes:data.bytes,validUntil:Date.now()+5*60_000};
    // SDK resolves the integration's OIDC identity (or an explicitly configured RW token).
    // Keep delegation/signing material server-side; return only one constrained PUT URL.
    const delegation=await issueSignedToken({...constraints,operations:['put']});
    const {presignedUrl}=await presignUrl(delegation,{...constraints,operation:'put',access:'private',addRandomSuffix:false,allowOverwrite:false});
    return NextResponse.json({presignedUrl},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:`Original photo could not be saved privately. Retry the same upload. Accepted originals: ${ORIGINAL_TYPES.join(', ')}; maximum 25 MiB. Your conversation is retained.`},{status:503,headers:{'Cache-Control':'no-store'}});}
}
