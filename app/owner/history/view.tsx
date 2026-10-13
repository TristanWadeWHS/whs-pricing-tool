'use client';
import { useEffect,useState } from 'react';
type Summary={id:string;status:string;created_at:string;revision:number};
type History={estimates?:Summary[];next?:{before:string;cursorId:string};estimate?:Summary;revisions?:{revision:number;created_at:string;record:unknown}[];
  photos?:{photo_id:string;ordinal:number;variant:string;status:string}[];failures?:unknown[];events?:unknown[];nextBefore?:number;error?:string};
export default function EstimateHistory() {
  const [url,setUrl]=useState('/api/estimate-history'),[data,setData]=useState<History|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');
    fetch(url,{signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);if(!controller.signal.aborted)setData(body);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message||'History unavailable.');});return ()=>controller.abort();},[url]);
  return <main style={{maxWidth:1000,margin:'auto',padding:24,overflowWrap:'anywhere'}}><a href="/owner">Back to owner estimator</a><h1>Private estimate history</h1>
    {error?<p role="alert">{error}</p>:!data?<p role="status">Loading saved estimates...</p>:<>
      {data.estimates?.map(e=><div key={e.id} style={{padding:'12px 0',borderBottom:'1px solid #ccc'}}><button onClick={()=>setUrl(`/api/estimate-history?id=${e.id}`)}>{e.id}</button><p>{e.status} · {e.created_at} · {e.revision} revisions</p></div>)}
      {data.next&&<button onClick={()=>setUrl(`/api/estimate-history?${new URLSearchParams(data.next)}`)}>Older estimates</button>}
      {data.estimate&&<><button onClick={()=>setUrl('/api/estimate-history')}>Recent estimates</button><h2>{data.estimate.id}</h2><p>{data.estimate.status}</p>
        <details><summary>Linked photos and upload status</summary>{data.photos?.map(p=><div key={`${p.photo_id}:${p.variant}`}><p>Photo {p.ordinal}, {p.variant}: {p.status}</p>{p.status==='complete'&&<a href={`/api/estimate-history/photo?id=${data.estimate!.id}&photo=${p.photo_id}&variant=${p.variant}`} target="_blank" rel="noreferrer">Open authorized photo</a>}</div>)}</details>
        {data.revisions?.map(r=><details key={r.revision}><summary>Revision {r.revision} · {r.created_at}</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(r.record,null,2)}</pre></details>)}
        {data.nextBefore&&<button onClick={()=>setUrl(`/api/estimate-history?id=${data.estimate!.id}&before=${data.nextBefore}`)}>Earlier revisions / original</button>}
        <details><summary>Customer-type selections and failed attempts</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({events:data.events,failures:data.failures},null,2)}</pre></details>
      </>}
    </>}
  </main>;
}
