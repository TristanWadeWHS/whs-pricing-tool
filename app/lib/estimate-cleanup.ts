import 'server-only';
import { del } from '@vercel/blob';
import { EstimateStore } from './estimate-store';
import { photoPath } from './estimate-photos';

export async function cleanupOrphans(store:EstimateStore,apply=false) {
  const candidates=await store.sql<{id:string}>(`SELECT e.id FROM pricer_estimates e WHERE e.revision=0 AND NOT e.analyzed
    AND e.created_at<now()-interval '7 days'
    AND EXISTS(SELECT 1 FROM pricer_photos p WHERE p.estimate_id=e.id AND p.status<>'deleted')
    AND NOT EXISTS(SELECT 1 FROM pricer_photos p WHERE p.estimate_id=e.id AND p.updated_at>now()-interval '7 days')
    AND NOT EXISTS(SELECT 1 FROM pricer_requests r WHERE r.estimate_id=e.id AND r.status='running' AND r.expires_at>now())
    ORDER BY e.created_at LIMIT 20`);
  let deleted=0,failed=0;
  if(apply)for(const {id} of candidates) {
    const [claim]=await store.sql<{ok:boolean}>('SELECT pricer_abandon($1) AS ok',[id]);
    if(!claim.ok)continue;
    for(const row of await store.photos(id)) {
      if(row.status==='deleted'||row.pathname!==photoPath(id,row.photo_id,row.variant))continue;
      try {
        await del(row.pathname);
        await store.sql("UPDATE pricer_photos SET status='deleted' WHERE estimate_id=$1 AND photo_id=$2 AND variant=$3",[id,row.photo_id,row.variant]);
        deleted++;
      } catch {failed++;}
    }
  }
  return {apply,candidateJobs:candidates.length,deleted,failed};
}
