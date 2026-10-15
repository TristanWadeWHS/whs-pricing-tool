import type { Inquiry } from './inquiry-schema';
type Photo = { original:File; archiveId:string };
async function jsonPost(path:string,data:unknown,signal:AbortSignal) {
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
  const result=await response.json(); if(!response.ok)throw new Error(result.error||'Private photo storage is unavailable. Retry when ready.'); return result;
}
export class ArchiveSession {
  id=crypto.randomUUID(); revision=0;
  private completed=new Set<string>();
  async capture(inquiry:Inquiry,signal:AbortSignal) {
    // Establish the cookie first so a failed contact save can retry the same ID.
    const session=await jsonPost('/api/estimate-session',{id:this.id},signal);
    if(!session.enabled)throw new Error('Private inquiry saving is unavailable. Please contact WHS.');
    await jsonPost('/api/estimate-session',{id:this.id,inquiry},signal);
  }
  async prepare(form:FormData,photos:Photo[],signal:AbortSignal) {
    await jsonPost('/api/estimate-session',{id:this.id},signal);
    for(let index=0;index<photos.length;index++) {
      const photo=photos[index]; if(this.completed.has(photo.archiveId))continue;
      const digest=await crypto.subtle.digest('SHA-256',await photo.original.arrayBuffer());
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const ext=photo.original.name.split('.').at(-1)?.toLowerCase();
      const mime=photo.original.type||({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'}[ext??'']);
      const metadata={estimateId:this.id,photoId:photo.archiveId,ordinal:index+1,mime,bytes:photo.original.size,hash};
      const upload=await jsonPost('/api/estimate-photos',{...metadata,action:'authorize'},signal);
      if(!upload.complete) {
        try {
          const response=await fetch(upload.presignedUrl,{method:'PUT',headers:{'Content-Type':mime!},body:photo.original,
            signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
          if(!response.ok)throw new Error('Upload rejected.');
        }
        catch { throw new Error('Original photo upload did not complete. Retry; your conversation and selected photos are retained.'); }
        await jsonPost('/api/estimate-photos',{...metadata,action:'complete'},signal);
      }
      this.completed.add(photo.archiveId);
    }
    if(!form.has('history'))form.set('history',JSON.stringify({estimateId:this.id,requestId:crypto.randomUUID(),revision:this.revision}));
  }
}
