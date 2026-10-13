import { verifiedStaff,UUID } from '../../../lib/estimate-access';
import { EstimateStore } from '../../../lib/estimate-store';
import { staffPhoto } from '../../../lib/estimate-photos';
export const runtime='nodejs';
export async function GET(req:Request) {
  const headers={'Cache-Control':'private, no-store'};
  if(!verifiedStaff(req))return new Response('Staff access required.',{status:403,headers});
  try {
    const p=new URL(req.url).searchParams,id=p.get('id')??'',pid=p.get('photo')??'',variant=p.get('variant')??'analysis';
    if(!UUID.test(id)||!UUID.test(pid)||!['original','analysis'].includes(variant))throw new Error();
    return await staffPhoto(new EstimateStore(),id,pid,variant);
  }catch{return new Response('Photo unavailable.',{status:404,headers});}
}
