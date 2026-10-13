import { afterEach,it,expect,vi } from 'vitest';
import { ArchiveSession } from '../app/lib/estimate-archive-client';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('uploads originals separately in order, retries partial receipts and preserves multipart idempotency',async()=>{
  const calls:{path:string;body:any}[]=[];
  const uploads:RequestInit[]=[];
  let failReceipt=true;
  vi.stubGlobal('fetch',vi.fn(async(path:string,init:RequestInit)=>{
    if(init.method==='PUT'){uploads.push(init);return new Response(null,{status:200});}
    const body=JSON.parse(String(init.body));calls.push({path,body});
    if(body.action==='complete'&&failReceipt){failReceipt=false;return Response.json({error:'Synthetic receipt failure'},{status:503});}
    return Response.json(path.includes('session')?{enabled:true}:body.action==='authorize'?{presignedUrl:'https://synthetic.invalid/scoped-upload'}:{complete:true});
  }));
  const photos=[0,1].map(n=>({original:new File([new Uint8Array([n])],`synthetic-${n}.heic`,{type:'image/heic'}),archiveId:crypto.randomUUID()}));
  const session=new ArchiveSession(),form=new FormData(),signal=new AbortController().signal;
  form.append('photos',new File(['synthetic processed'],'synthetic.jpg',{type:'image/jpeg'}));
  await expect(session.prepare(form,photos,signal)).rejects.toThrow('Synthetic receipt');
  expect(form.has('history')).toBe(false);
  await session.prepare(form,photos,signal);
  const request=String(form.get('history'));await session.prepare(form,photos,signal);
  expect(form.get('history')).toBe(request);expect(form.getAll('photos')).toHaveLength(1);
  expect(calls.filter(c=>c.body.action==='authorize').map(c=>c.body.ordinal)).toEqual([1,1,2]);
  expect(uploads).toHaveLength(3);
  expect(uploads[0].body).toBe(photos[0].original);
  expect(uploads[0]).toMatchObject({credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',headers:{'Content-Type':'image/heic'}});
  expect(JSON.parse(request)).toMatchObject({estimateId:session.id,revision:0});
  expect(JSON.stringify(calls)).not.toContain('synthetic-0.heic');
});
