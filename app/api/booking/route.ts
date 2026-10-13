import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readConversation } from '../../lib/conversation-state';
import { volumeBaseline } from '../../lib/pricing';
import { calculatePromotion } from '../../lib/promotion';
import { bookingDetailsSchema, customerTypeSchema, futurePreference } from '../../lib/booking-schema';
import { BOOKING_DISABLED_NOTICE, getBookingProviders, runBooking } from '../../lib/booking-workflow';
import { historyEnabled, publicEnabled, visitor, verifiedStaff, requireSameOrigin } from '../../lib/estimate-access';
import { EstimateStore } from '../../lib/estimate-store';
import { customerEstimate } from '../../lib/conversation-presentation';

export const runtime = 'nodejs';
const token = z.string().min(1).max(111_000);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('promotion'), token, customerType: customerTypeSchema }).strict(),
  z.object({ action: z.literal('book'), token, customerType: customerTypeSchema, details: bookingDetailsSchema,
    confirmed: z.literal(true), requestId: z.uuid() }).strict(),
]);
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function boundedJson(req: Request) {
  const reader = req.body?.getReader(); if (!reader) throw new Error('Missing request.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 128 * 1024) { await reader.cancel(); throw new Error('Oversized request.'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function POST(req: Request) {
  try {
    const data = schema.parse(await boundedJson(req));
    const state = readConversation(data.token);
    if(publicEnabled() && data.action!=='promotion')return reply({error:'Booking is not available in this experience.'},403);
    if(historyEnabled()) {
      requireSameOrigin(req);
      const v=visitor(req);
      if(!v||state.historyVisitorId!==v||!state.historyEstimateId)return reply({error:'Estimate session required.'},401);
      const job=await new EstimateStore().job(v,state.historyEstimateId);
      if(job.revision!==state.turn)return reply({error:'Refresh the current estimate before choosing customer type.'},409);
    } else if(publicEnabled()&&!verifiedStaff(req))return reply({error:'Public estimates require private storage.'},503);
    if (!state.completedEstimate || state.questions.length || state.items.some((i) => i.choice === 'unresolved') || !state.items.some((i) => i.choice === 'included')) {
      return reply({ error: 'Finish confirming scope and answering questions before the follow-up step.' }, 409);
    }
    const baseline = volumeBaseline(state.completedEstimate.percent, state.completedEstimate.rangeText);
    // Chat intentionally has no distance tier. Never invent a minimum or discount waiver.
    const promotion = calculatePromotion(baseline, null, state.completedEstimate.exceptional);
    if (data.action === 'promotion') {
      const result={ customerType: data.customerType, promotion, bookingEnabled: false, bookingNotice: BOOKING_DISABLED_NOTICE,
      message: data.customerType === 'new' ? 'Welcome to the Wade Home Services family! We are happy to help. Here is your temporary promotion illustration for team review.'
        : 'Welcome back! It is wonderful to help you again. Here is your temporary promotion illustration for team review.' };
      if(historyEnabled())await new EstimateStore().sql('INSERT INTO pricer_events(estimate_id,event_key,record) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',
        [state.historyEstimateId,`promotion:${state.turn}:${data.customerType}`,JSON.stringify({customerMessage:data.customerType==='new'?'I am a new customer.':'I am a returning customer.',result,displayed:{original:customerEstimate(promotion.original),discount:customerEstimate(promotion.discount),total:customerEstimate(promotion.total)},revision:state.turn})]);
      return reply(result);
    }
    if (!futurePreference(data.details)) return reply({ error: 'Choose a future preferred date and time in Pacific time.' }, 400);
    const result = await runBooking({ requestId: data.requestId, details: data.details, confirmed: data.confirmed,
      staffApproved: false, estimateContext: JSON.stringify({ estimate: state.completedEstimate, scope: state.items.filter((i) => i.choice === 'included'), customerType: data.customerType }) }, getBookingProviders());
    return reply(result, result.status === 'disabled' ? 503 : result.status === 'review_required' ? 409 : result.status === 'failed' ? 502 : 200);
  } catch {
    // No customer details, tokens, provider responses or validation payloads in logs.
    return reply({ error: 'Check your details or refresh an expired estimate. Nothing was booked or sent.' }, 400);
  }
}
