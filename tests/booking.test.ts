import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { POST } from '../app/api/booking/route';
import { freshConversation, signConversation } from '../app/lib/conversation-state';
import { volumeBaseline } from '../app/lib/pricing';
import { calculatePromotion, TEMPORARY_PROMOTION_RATE } from '../app/lib/promotion';
import { bookingDetailsSchema, futurePreference, type BookingDetails } from '../app/lib/booking-schema';
import { getBookingProviders, runBooking, type BookingProviders, type BookingRequest } from '../app/lib/booking-workflow';

afterEach(() => vi.unstubAllEnvs());
const details: BookingDetails = { name: 'Synthetic Customer', address: 'Synthetic service address, California', date: '2099-10-20', time: '10:30', contactMethod: 'email', email: 'synthetic@example.test', phone: '' };
function token(ready = true, exceptional = false) {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-booking-key');
  return signConversation({ ...freshConversation(), items: [{ id: 'i_box', label: 'boxes', room: 'Garage', photoRefs: [1], choice: ready ? 'included' : 'unresolved' }],
    completedEstimate: ready ? { percent: 60, rangeText: '60%', exceptional } : undefined });
}
async function post(body: unknown) {
  const response = await POST(new Request('https://synthetic.test/api/booking', { method: 'POST', body: JSON.stringify(body) }));
  return { response, body: await response.json() };
}
function mockProviders() {
  const events = new Map<string, { id: string; fingerprint: string }>();
  const deliveries = new Set<string>(), order: string[] = [];
  const providers: BookingProviders = {
    calendar: {
      find: vi.fn(async (key) => events.get(key) ?? null),
      availability: vi.fn(async () => { order.push('availability'); return 'synthetic-slot'; }),
      reserve: vi.fn(async (_slot, request, fingerprint) => { order.push('reserve'); if (!events.has(request.requestId)) events.set(request.requestId, { id: 'synthetic-event', fingerprint }); return events.get(request.requestId)!; }),
    },
    email: vi.fn(async (_recipient, _event, key) => { order.push('email'); deliveries.add(key); }),
    sms: vi.fn(async (_recipient, _event, key) => { order.push('sms'); deliveries.add(key); }),
    businessEmail: 'business@example.test',
  };
  return { providers, events, deliveries, order };
}
const request = (): BookingRequest => ({ requestId: 'synthetic-request', confirmed: true, staffApproved: true, details: { ...details }, estimateContext: 'synthetic-staff-approved-scope' });

describe('temporary promotion and protected follow-up', () => {
  it('retires all customer promotion requests without altering the standard baseline', async () => {
    const t = token();
    for (const customerType of ['new', 'returning', 'new']) {
      const r = await post({ action: 'promotion', token: t, customerType });
      expect(r.response.status).toBe(410); expect(r.response.headers.get('cache-control')).toBe('no-store');
      expect(r.body.promotion).toBeUndefined();expect(JSON.stringify(r.body)).not.toMatch(/297|\$/);
    }
    expect(volumeBaseline(60,'60%')).toMatchObject({low:330,high:330});
  });
  it('never discounts below a known mandatory minimum and flags unknown minimums/exceptional work', () => {
    expect(calculatePromotion(volumeBaseline(10, '10%'), 130, false)).toMatchObject({ original: { low: 130, high: 130 }, discount: { low: 0, high: 0 }, total: { low: 130, high: 130 } });
    expect(calculatePromotion(volumeBaseline(25, '25%'), 130, false).total.low).toBe(130);
    expect(calculatePromotion(volumeBaseline(60, '60%'), null, false).reasons.join(' ')).toContain('minimum is not established');
    expect(calculatePromotion(volumeBaseline(60, '60%'), 130, true).application).toBe('illustration');
    expect(calculatePromotion(volumeBaseline(60, '60%'), 130, true).reasons.join(' ')).toContain('Exceptional work');
  });
  it('does not accept client prices, approval, invalid customer types or unresolved/tampered estimates', async () => {
    for (const extra of [{ amount: 1 }, { staffApproved: true }, { customerType: 'invented' }]) {
      expect((await post({ action: 'promotion', token: token(), customerType: 'new', ...extra })).response.status).toBe(410);
    }
    const waiting = await post({ action: 'promotion', token: token(false), customerType: 'new' });
    expect(waiting.response.status).toBe(410); expect(JSON.stringify(waiting.body)).not.toMatch(/\$|330|297/);
    expect((await post({ action: 'promotion', token: `${token()}x`, customerType: 'new' })).response.status).toBe(410);
  });
  it('validates the chosen contact method, real dates and future Pacific preferences', () => {
    expect(bookingDetailsSchema.safeParse(details).success).toBe(true);
    expect(bookingDetailsSchema.safeParse({ ...details, contactMethod: 'text', email: '', phone: '+1 202-555-0100' }).success).toBe(true);
    for (const change of [{ email: '' }, { contactMethod: 'text' }, { date: '2099-02-30' }, { time: '25:00' }, { email: 'bad' }, { phone: 'abc1234567890' }]) {
      expect(bookingDetailsSchema.safeParse({ ...details, ...change }).success).toBe(false);
    }
    expect(futurePreference(details, new Date('2026-10-08T12:00Z'))).toBe(true);
    expect(futurePreference({ ...details, date: '2026-10-08', time: '04:00' }, new Date('2026-10-08T12:00Z'))).toBe(false);
  });
  it('keeps Preview inert even with valid confirmed details; no details are echoed', async () => {
    expect(getBookingProviders()).toBeNull();
    const r = await post({ action: 'book', token: token(), customerType: 'new', details, confirmed: true, requestId: '00000000-0000-4000-8000-000000000001' });
    expect(r.response.status).toBe(410);
    expect(JSON.stringify(r.body)).not.toContain(details.name); expect(JSON.stringify(r.body)).not.toContain(details.email);
    expect(r.body.eventId).toBeUndefined();
    expect((await post({ action: 'book', token: token(), customerType: 'new', details, confirmed: false, requestId: '00000000-0000-4000-8000-000000000001' })).response.status).toBe(410);
  });
  it('protects the new API with existing auth and no-store', () => {
    vi.stubEnv('INTERNAL_ACCESS_TOKEN', 'synthetic');
    const response = proxy(new NextRequest('https://synthetic.test/api/booking?access_token=synthetic'));
    expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('mock-only booking orchestration contract (no connected adapter)', () => {
  it('requires customer confirmation, staff approval and chosen notification support before calendar access', async () => {
    const { providers } = mockProviders();
    expect((await runBooking({ ...request(), confirmed: false }, providers)).status).toBe('failed');
    expect((await runBooking({ ...request(), staffApproved: false }, providers)).status).toBe('review_required');
    expect((await runBooking(request(), { ...providers, email: undefined })).status).toBe('disabled');
    expect(providers.calendar.availability).not.toHaveBeenCalled();
  });
  it('checks availability, atomically reserves, then notifies the selected contact and business', async () => {
    for (const contactMethod of ['email', 'text'] as const) {
      const { providers, order, deliveries } = mockProviders();
      const r = await runBooking({ ...request(), details: { ...details, contactMethod, phone: '+1 202-555-0100' } }, providers);
      expect(r).toMatchObject({ status: 'booked', customerNotification: 'sent', businessNotification: 'sent' });
      expect(order).toEqual(['availability', 'reserve', contactMethod === 'email' ? 'email' : 'sms', 'email']);
      expect(deliveries.size).toBe(2);
    }
  });
  it('does not create or notify for unavailable dates, lost slot races or provider failures', async () => {
    const { providers } = mockProviders();
    vi.mocked(providers.calendar.availability).mockResolvedValueOnce(null);
    expect((await runBooking(request(), providers)).status).toBe('unavailable');
    expect(providers.calendar.reserve).not.toHaveBeenCalled(); expect(providers.email).not.toHaveBeenCalled();
    vi.mocked(providers.calendar.reserve).mockResolvedValueOnce(null);
    expect((await runBooking(request(), providers)).status).toBe('unavailable');
    vi.mocked(providers.calendar.availability).mockRejectedValueOnce(new Error('private provider detail'));
    const failed = await runBooking(request(), providers);
    expect(failed.status).toBe('failed'); expect(JSON.stringify(failed)).not.toContain('private'); expect(providers.email).not.toHaveBeenCalled();
  });
  it('uses stable reservation/delivery keys for duplicate requests and notification retries', async () => {
    const { providers, events, deliveries } = mockProviders();
    vi.mocked(providers.email!).mockRejectedValueOnce(new Error('private notification detail'));
    const first = await runBooking(request(), providers);
    expect(first).toMatchObject({ status: 'booked', customerNotification: 'failed', businessNotification: 'sent' });
    expect((await runBooking(request(), providers)).customerNotification).toBe('sent');
    expect((await runBooking(request(), providers)).status).toBe('booked');
    expect(events.size).toBe(1); expect(deliveries.size).toBe(2); expect(providers.calendar.reserve).toHaveBeenCalledTimes(1);
    const changed = await runBooking({ ...request(), details: { ...details, time: '15:00' } }, providers);
    expect(changed.status).toBe('failed'); expect(providers.calendar.reserve).toHaveBeenCalledTimes(1);
  });
  it('recovers an uncertain create result by finding the existing event, not reserving again', async () => {
    const { providers, events } = mockProviders();
    vi.mocked(providers.calendar.reserve).mockImplementationOnce(async (_slot, r, fingerprint) => {
      events.set(r.requestId, { id: 'synthetic-event', fingerprint }); throw new Error('response lost');
    });
    expect((await runBooking(request(), providers)).status).toBe('failed');
    expect(providers.email).not.toHaveBeenCalled();
    expect((await runBooking(request(), providers)).status).toBe('booked'); expect(providers.calendar.reserve).toHaveBeenCalledTimes(1);
  });
  it('relies on atomic provider keys for concurrent duplicates, never creating two events or deliveries', async () => {
    const { providers, events, deliveries } = mockProviders();
    const results = await Promise.all([runBooking(request(), providers), runBooking(request(), providers)]);
    expect(results.every((r) => r.status === 'booked')).toBe(true);
    expect(events.size).toBe(1); expect(deliveries.size).toBe(2);
  });
});
