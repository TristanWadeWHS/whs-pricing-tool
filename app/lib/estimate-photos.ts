import 'server-only';
import { get, head, put } from '@vercel/blob';
import { EstimateStore, ArchiveError, type PhotoRecord } from './estimate-store';
export const ORIGINAL_LIMIT = 25 * 1024 * 1024; // Matches existing optimizer original cap; analysis limits unchanged.
export const ORIGINAL_TYPES = ['image/jpeg','image/png','image/webp','image/heic','image/heif'];
export function photoPath(id:string,pid:string,variant:string) { return `pricer-estimates/v1/${id}/${pid}/${variant}`; }
export function privateMetadata(value:{url:string;pathname:string;size:number;contentType:string},row:PhotoRecord) {
  return new URL(value.url).hostname.endsWith('.private.blob.vercel-storage.com') && value.pathname===row.pathname && value.size===Number(row.bytes) && value.contentType===row.content_type;
}
export async function confirmPhoto(store:EstimateStore,id:string,row:PhotoRecord) {
  try {
    const metadata=await head(row.pathname);
    if(!privateMetadata(metadata,row))throw new Error('Photo mismatch.');
    await store.sql("UPDATE pricer_photos SET status='complete',updated_at=now() WHERE estimate_id=$1 AND photo_id=$2 AND variant=$3 AND status<>'deleted'",[id,row.photo_id,row.variant]);
  } catch {
    await store.sql("UPDATE pricer_photos SET status='failed',updated_at=now() WHERE estimate_id=$1 AND photo_id=$2 AND variant=$3 AND status<>'complete'",[id,row.photo_id,row.variant]);
    throw new ArchiveError('photo_incomplete',503);
  }
}
export async function archiveAnalysisPhotos(store:EstimateStore,v:string,id:string,photos:{bytes:Uint8Array;mime:string;hash:string}[]) {
  const originals=(await store.photos(id)).filter(p=>p.variant==='original');
  for(let n=0;n<photos.length;n++) {
    const original=originals.find(p=>p.ordinal===n+1), photo=photos[n];
    if(!original||original.status!=='complete')throw new ArchiveError('photo_incomplete',409);
    const row=await store.photo(v,id,{...original,variant:'analysis',pathname:photoPath(id,original.photo_id,'analysis'),bytes:photo.bytes.length,content_type:photo.mime,declared_hash:photo.hash,status:'pending',tokens:0});
    if(row.status==='complete')continue;
    try {
      // If a prior write completed but its receipt failed, verify instead of overwriting.
      let exists=false; try { exists=privateMetadata(await head(row.pathname),row); } catch { /* New object. */ }
      if(!exists)await put(row.pathname,Buffer.from(photo.bytes),{access:'private',contentType:photo.mime,addRandomSuffix:false,allowOverwrite:false});
      await confirmPhoto(store,id,row);
    } catch {throw new ArchiveError('photo_incomplete',503);}
  }
}
export async function staffPhoto(store:EstimateStore,id:string,pid:string,variant:string) {
  const row=(await store.photos(id)).find(p=>p.photo_id===pid&&p.variant===variant&&p.status==='complete');
  if(!row||row.pathname!==photoPath(id,pid,variant))throw new ArchiveError('not_found',404);
  const photo=await get(row.pathname,{access:'private'});
  if(!photo||photo.statusCode!==200)throw new ArchiveError('not_found',404);
  return new Response(photo.stream,{headers:{'Cache-Control':'private, no-store','Content-Type':row.content_type,'Content-Disposition':variant==='original'?'attachment; filename="original-photo"':'inline','X-Content-Type-Options':'nosniff'}});
}
