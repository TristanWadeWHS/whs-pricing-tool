import 'server-only';
import postgres from 'postgres';
import { randomUUID, createHash } from 'node:crypto';
import { allowanceEnabled, boundedSetting, historyConfigured, LIMIT_MESSAGE } from './estimate-access';
import type { ConversationState, ConversationResult, ConversationModel } from './conversation-schema';
import { customerEstimate, localComparison, ESTIMATE_INTRO } from './conversation-presentation';
import { inquirySchema, type Inquiry } from './inquiry-schema';

export type Query = <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<T[]>;
let client: ReturnType<typeof postgres> | undefined;
export const query: Query = async <T extends Record<string,unknown>>(text: string, values: unknown[] = []) => {
  if (!historyConfigured()) throw new Error('Estimate storage is not configured.');
  client ??= postgres(process.env.PRICER_DATABASE_URL!, { max: 3, ssl: 'require', connect_timeout: 10, idle_timeout: 20, onnotice: () => {} });
  return await client.unsafe(text, values as never[]) as unknown as T[];
};
export class ArchiveError extends Error { constructor(public category: string, public status=409) { super(category==='daily_limit' ? LIMIT_MESSAGE : 'Estimate history could not be updated. Retry this request or contact WHS.'); } }
export type ArchiveJob = { id: string; visitor_id: string; revision: number; state: ConversationState | null; analyzed: boolean; status: string };
export type PhotoRecord = { photo_id: string; ordinal: number; variant: 'original'|'analysis'; pathname:string; content_type:string; bytes:number; declared_hash:string; status:string; tokens:number };
export class EstimateStore {
  constructor(public sql: Query=query) {}
  async saveInquiry(v:string,id:string,input:Inquiry) {
    const inquiry=inquirySchema.parse(input);
    await this.job(v,id);
    // Contact details never enter signed model context, model prompts or log messages.
    // First capture is immutable; a retry must match rather than overwrite a saved inquiry.
    await this.sql(`INSERT INTO pricer_events(estimate_id,event_key,record)
      VALUES($1,'inquiry',$2::text::jsonb) ON CONFLICT DO NOTHING`,[id,JSON.stringify({...inquiry,kind:'inquiry',source:'AI Pricer'})]);
    const saved=await this.inquiry(v,id);
    if(saved.phone!==inquiry.phone || saved.email!==inquiry.email)throw new ArchiveError('contact_conflict');
    await this.setInquiryServices(v,id,inquiry.services);
  }
  async inquiry(v:string,id:string) {
    await this.job(v,id);
    const [row]=await this.sql<{record:Inquiry}>("SELECT record FROM pricer_events WHERE estimate_id=$1 AND event_key='inquiry'",[id]);
    if(!row)throw new ArchiveError('contact_required',409);
    return row.record;
  }
  async setInquiryServices(v:string,id:string,services:string[]) {
    await this.inquiry(v,id);
    await this.sql(`UPDATE pricer_events SET record=jsonb_set(record,'{services}',$2::text::jsonb)
      WHERE estimate_id=$1 AND event_key='inquiry'`,[id,JSON.stringify(services)]);
  }
  async originalQuote(id:string) {
    // Append-only revisions are authoritative: later clarification must not replace
    // the first completed provisional quote used by a future booking handoff.
    const [quote]=await this.sql(`SELECT revision,created_at,record->'displayed' AS displayed,
      record->'result'->'baseline' AS baseline,record->'versions' AS versions
      FROM pricer_revisions WHERE estimate_id=$1 AND record->'displayed'->>'amount' IS NOT NULL
      ORDER BY revision ASC LIMIT 1`,[id]);
    return quote??null;
  }
  async create(v: string, id: string) {
    await this.sql('SELECT pricer_create($1,$2)',[v,id]);
    return this.job(v,id);
  }
  async job(v:string,id:string) {
    const [job]=await this.sql<ArchiveJob & Record<string,unknown>>('SELECT id,visitor_id,revision,state,analyzed,status FROM pricer_estimates WHERE id=$1 AND visitor_id=$2',[id,v]);
    if (!job) throw new ArchiveError('not_found',404); return job;
  }
  async reserve(v:string,id:string,request:string,revision:number,input:unknown,paid:boolean,staff:boolean,now=new Date()) {
    const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const lease=randomUUID();
    const [row]=await this.sql<{value:{error?:string;cached?:boolean;result?:Omit<ConversationResult,'token'>;state?:ConversationState;lease?:string}}>(
      'SELECT pricer_reserve($1,$2,$3,$4,$5::text::jsonb,$6,$7,$8,$9,$10,$11,$12) AS value',
      [v,id,request,digest,JSON.stringify(input),revision,paid,allowanceEnabled()&&!staff,
        boundedSetting('PRICER_DAILY_ALLOWANCE',3,20),boundedSetting('PRICER_MAX_ANALYSIS_REVISIONS',8,20),lease,now]);
    if(row.value.error) throw new ArchiveError(row.value.error,row.value.error==='daily_limit'?429:409);
    return row.value;
  }
  async finish(v:string,id:string,request:string,lease:string,input:unknown,state:ConversationState,result:Omit<ConversationResult,'token'>,model:ConversationModel|null,template:string,modelId:string,now=new Date()) {
    const displayedBaseline=!result.questions.length&&!result.items.some(i=>i.choice==='unresolved')?result.baseline:null;
    const record={ input, state, result, analysis:model, photos:await this.photos(id), versions:{model:modelId,prompt:'conversation-v1-ordinary-volume',schema:'conversation-v1',pricing:'volume-550-v1',presentation:'midpoint-benchmark-750-v1'},
      promptTemplate:template, displayed:{amount:displayedBaseline?customerEstimate(displayedBaseline):null,introduction:displayedBaseline?ESTIMATE_INTRO:result.message,comparison:localComparison(displayedBaseline)},
      pricingInputs:{baseline:result.baseline,services:state.services},appliedAdjustments:[],outcomes:{customerId:null,acceptedQuoteId:null,bookingJobId:null,finalCompletedPrice:null,actualLoads:null,completionDate:null,scopeChangeReason:null} };
    // These values are already JSON text. Prevent the driver's JSONB serializer
    // from encoding them again as strings before PostgreSQL receives the objects.
    const [done]=await this.sql<{ok:boolean}>('SELECT pricer_finish($1,$2,$3,$4,$5::text::jsonb,$6::text::jsonb,$7::text::jsonb,$8) AS ok',[v,id,request,lease,JSON.stringify(result),JSON.stringify(state),JSON.stringify(record),now]);
    if(!done.ok)throw new ArchiveError('stale_lease');
  }
  async fail(v:string,id:string,request:string,lease:string,category:string) { await this.sql('SELECT pricer_fail($1,$2,$3,$4,$5)',[v,id,request,lease,category]); }
  async photos(id:string) {return this.sql<PhotoRecord & Record<string,unknown>>('SELECT photo_id,ordinal,variant,pathname,content_type,bytes,declared_hash,status,tokens FROM pricer_photos WHERE estimate_id=$1 ORDER BY ordinal,variant',[id]);}
  async photo(v:string,id:string,photo:PhotoRecord) {
    const job=await this.job(v,id); const existing=(await this.photos(id)).find(p=>p.ordinal===photo.ordinal&&p.variant===photo.variant);
    if(existing && (existing.photo_id!==photo.photo_id || existing.declared_hash!==photo.declared_hash || Number(existing.bytes)!==photo.bytes || existing.content_type!==photo.content_type))throw new ArchiveError('photo_conflict');
    if(job.status==='abandoned'||(!existing && job.state?.completedEstimate))throw new ArchiveError('scope_locked');
    await this.sql(`INSERT INTO pricer_photos(estimate_id,photo_id,ordinal,variant,pathname,content_type,bytes,declared_hash,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT DO NOTHING`,[id,photo.photo_id,photo.ordinal,photo.variant,photo.pathname,photo.content_type,photo.bytes,photo.declared_hash]);
    const row=(await this.photos(id)).find(p=>p.photo_id===photo.photo_id&&p.variant===photo.variant);
    if(!row || row.declared_hash!==photo.declared_hash || Number(row.bytes)!==photo.bytes || row.content_type!==photo.content_type)throw new ArchiveError('photo_conflict');
    return row;
  }
}
