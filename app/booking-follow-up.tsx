'use client';

import { useEffect, useRef, useState } from 'react';
import { bookingDetailsSchema, futurePreference, type BookingDetails, type BookingOutcome, type CustomerType, type PromotionReply } from './lib/booking-schema';
import { moneyInterval } from './lib/promotion';
import styles from './conversation.module.css';

type Props = { token: string; scope: string[]; onMessage: (role: 'user' | 'winston', text: string) => void };
const emptyDetails: BookingDetails = { name: '', address: '', date: '', time: '', contactMethod: 'email', email: '', phone: '' };

export default function BookingFollowUp({ token, scope, onMessage }: Props) {
  const [offer, setOffer] = useState<PromotionReply | null>(null);
  const [details, setDetails] = useState(emptyDetails);
  const [review, setReview] = useState<BookingDetails | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<BookingOutcome | null>(null);
  const [attempted, setAttempted] = useState(false);
  const mustKeepRequest = attempted && !['unavailable', 'disabled', 'review_required'].includes(outcome?.status ?? '');
  const lock = useRef(false), alive = useRef(true), requestId = useRef('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);

  async function request(body: unknown) {
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      const response = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
      const data = await response.json();
      if (data.error || (!response.ok && !data.status)) throw new Error(data.error || 'This step could not be completed. Your entries are retained; please retry.');
      return data;
    } finally { clearTimeout(timeout); }
  }
  async function choose(customerType: CustomerType) {
    if (lock.current || mustKeepRequest || offer?.customerType === customerType) return;
    lock.current = true; setBusy(true); setError('');
    onMessage('user', customerType === 'new' ? 'I am a new customer.' : 'I am a returning customer.');
    try {
      const data = await request({ action: 'promotion', token, customerType }) as PromotionReply;
      if (!alive.current) return;
      if (!data.promotion || data.customerType !== customerType) throw new Error('The promotion could not be checked. Please retry.');
      setOffer(data); setReview(null); setConfirmed(false); setOutcome(null); requestId.current = '';
      onMessage('winston', data.message);
    } catch { if (alive.current) setError('The promotion could not be checked. Tap your customer type to retry; your estimate is unchanged.'); }
    finally { if (alive.current) { lock.current = false; setBusy(false); } }
  }
  function prepareReview(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const parsed = bookingDetailsSchema.safeParse(details);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Check the booking details.'); return; }
    if (!futurePreference(parsed.data)) { setError('Choose a future preferred date and time in Pacific time.'); return; }
    setReview(parsed.data); setConfirmed(false); setOutcome(null); requestId.current = crypto.randomUUID();
  }
  async function book() {
    if (lock.current || !review || !confirmed || !offer?.bookingEnabled) return;
    lock.current = true; setBusy(true); setError(''); setAttempted(true);
    try {
      const data = await request({ action: 'book', token, customerType: offer.customerType, details: review, confirmed: true, requestId: requestId.current }) as BookingOutcome;
      if (alive.current) setOutcome(data);
    } catch { if (alive.current) setError('Booking status could not be confirmed. Your details are retained. Retry this same request; do not start another booking.'); }
    finally { if (alive.current) { lock.current = false; setBusy(false); } }
  }
  const change = (key: keyof BookingDetails, value: string) => setDetails((old) => ({ ...old, [key]: value }));
  return <section className={styles.followUp} aria-label="Customer follow-up">
    <h2>A little thank-you from our team</h2>
    <p>Are you a new or returning Wade Home Services customer?</p>
    <div className={styles.services}>
      <button type="button" disabled={busy || mustKeepRequest} aria-pressed={offer?.customerType === 'new'} onClick={() => void choose('new')}>New customer</button>
      <button type="button" disabled={busy || mustKeepRequest} aria-pressed={offer?.customerType === 'returning'} onClick={() => void choose('returning')}>Returning customer</button>
    </div>
    {busy && <p role="status">Thanks! We&apos;re checking this step. Please wait.</p>}
    {error && <p role="alert">{error}</p>}
    {offer && <>
      <section aria-label="Temporary promotion" className={styles.promotion}>
        <h3>Temporary {offer.promotion.rate * 100}% promotion</h3>
        <p>{offer.promotion.application === 'illustration' ? 'Illustration only, pending staff confirmation of eligibility and minimums.' : 'Provisional promotion; staff review still required.'}</p>
        <dl><dt>Original {offer.promotion.application === 'illustration' ? 'volume baseline' : 'eligible estimate'}</dt><dd>{moneyInterval(offer.promotion.original)}</dd>
          <dt>Discount {offer.promotion.application === 'illustration' ? '(illustrative)' : ''}</dt><dd>{moneyInterval(offer.promotion.discount)}</dd>
          <dt>Discounted {offer.promotion.application === 'illustration' ? 'volume baseline (illustrative)' : 'total'}</dt><dd>{moneyInterval(offer.promotion.total)}</dd></dl>
        <ul>{offer.promotion.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <p>Not a final price or an approved quote. Scope, access, disposal and exceptional work remain subject to staff review.</p>
      </section>
      {!offer.bookingEnabled && <p role="status">{offer.bookingNotice} Details below stay in this tab and are not submitted while booking is disabled.</p>}
      {!review ? <form onSubmit={prepareReview} aria-label="Booking preferences">
        <h3>Preferred service details</h3>
        <fieldset disabled={busy}>
          <label htmlFor="booking-name">Customer name</label><input id="booking-name" autoComplete="name" maxLength={100} required value={details.name} onChange={(e) => change('name', e.target.value)} />
          <label htmlFor="booking-address">Service address</label><input id="booking-address" autoComplete="street-address" maxLength={250} required value={details.address} onChange={(e) => change('address', e.target.value)} />
          <div className={styles.bookingGrid}><div><label htmlFor="booking-date">Preferred date</label><input id="booking-date" type="date" required value={details.date} onChange={(e) => change('date', e.target.value)} /></div>
            <div><label htmlFor="booking-time">Preferred time (Pacific)</label><input id="booking-time" type="time" required value={details.time} onChange={(e) => change('time', e.target.value)} /></div></div>
          <fieldset><legend>Confirmation method</legend><div className={styles.contactChoices}>
            <label><input type="radio" name="contactMethod" value="email" checked={details.contactMethod === 'email'} onChange={() => change('contactMethod', 'email')} />Email</label>
            <label><input type="radio" name="contactMethod" value="text" checked={details.contactMethod === 'text'} onChange={() => change('contactMethod', 'text')} />Text message</label>
          </div></fieldset>
          <label htmlFor="booking-email">Email{details.contactMethod === 'text' ? ' (optional)' : ''}</label><input id="booking-email" type="email" autoComplete="email" maxLength={254} required={details.contactMethod === 'email'} value={details.email} onChange={(e) => change('email', e.target.value)} />
          <label htmlFor="booking-phone">Phone for text{details.contactMethod === 'email' ? ' (optional)' : ''}</label><input id="booking-phone" type="tel" autoComplete="tel" maxLength={30} required={details.contactMethod === 'text'} value={details.phone} onChange={(e) => change('phone', e.target.value)} />
          <button type="submit">Review request</button>
        </fieldset>
      </form> : <section aria-label="Review booking request">
        <h3>Review before submitting</h3>
        <p>Confirmed scope: {scope.join(', ')}</p>
        <p>{offer.customerType === 'new' ? 'New customer' : 'Returning customer'} · Provisional estimate and promotion above, not a final quote.</p>
        <dl><dt>Name</dt><dd>{review.name}</dd><dt>Service address</dt><dd>{review.address}</dd>
          <dt>Requested service time</dt><dd>{review.date} at {review.time} Pacific (not reserved)</dd>
          <dt>Confirmation method</dt><dd>{review.contactMethod === 'email' ? 'Email' : 'Text message'}</dd>
          {!!review.email && <><dt>Email</dt><dd>{review.email}</dd></>}{!!review.phone && <><dt>Phone</dt><dd>{review.phone}</dd></>}</dl>
        {!outcome?.eventId && <>
          <label className={styles.confirmBooking}><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />I confirm these details and understand the estimate requires staff review.</label>
          <div className={styles.bookingActions}><button type="button" disabled={busy || mustKeepRequest} onClick={() => { setReview(null); setConfirmed(false); setOutcome(null); setAttempted(false); }}>Edit details</button>
            <button type="button" disabled={busy || !confirmed || !offer.bookingEnabled} onClick={() => void book()}>Confirm booking request</button></div>
        </>}
        {outcome && <div role="status"><p>{outcome.message}</p>
          {outcome.status === 'booked' && <><p>Business notification: {outcome.businessNotification === 'sent' ? 'sent' : outcome.businessNotification === 'failed' ? 'delivery failed; staff follow-up needed' : 'not configured'}.</p>
            {(outcome.customerNotification === 'failed' || outcome.businessNotification === 'failed') && <button type="button" disabled={busy} onClick={() => void book()}>Retry confirmation</button>}</>}
        </div>}
      </section>}
    </>}
  </section>;
}
