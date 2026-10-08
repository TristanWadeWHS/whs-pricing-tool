import 'server-only';
import { createHash } from 'node:crypto';
import type { BookingDetails, BookingOutcome } from './booking-schema';

export const BOOKING_DISABLED_NOTICE = 'Booking is unavailable in this Preview: calendar availability, email/text delivery and staff approval are not connected. No appointment or message has been created.';
type Event = { id: string; fingerprint: string };
export type BookingRequest = { requestId: string; confirmed: boolean; staffApproved: boolean; details: BookingDetails; estimateContext: string };
// An authorized adapter must provide durable idempotency and atomic slot reservation.
// No adapter is connected here; tests inject mocks, never real service credentials.
export type BookingProviders = {
  calendar: {
    find: (key: string) => Promise<Event | null>;
    availability: (details: BookingDetails) => Promise<string | null>;
    reserve: (slot: string, request: BookingRequest, fingerprint: string) => Promise<Event | null>;
  };
  email?: (recipient: string, eventId: string, key: string) => Promise<void>;
  sms?: (recipient: string, eventId: string, key: string) => Promise<void>;
  businessEmail?: string;
};
export function getBookingProviders(): BookingProviders | null { return null; }

export async function runBooking(request: BookingRequest, providers: BookingProviders | null): Promise<BookingOutcome> {
  if (!request.confirmed) return { status: 'failed', message: 'Review and confirm the details first. Nothing was booked.' };
  if (!providers) return { status: 'disabled', message: BOOKING_DISABLED_NOTICE };
  if (!request.staffApproved) return { status: 'review_required', message: 'Staff must approve the provisional estimate, minimum and any exceptional work before booking. Nothing was booked.' };
  const notify = request.details.contactMethod === 'email' ? providers.email : providers.sms;
  if (!notify) return { status: 'disabled', message: 'The selected confirmation method is not configured. Nothing was booked or sent.' };
  const fingerprint = createHash('sha256').update(JSON.stringify({ details: request.details, estimateContext: request.estimateContext })).digest('hex');
  let event: Event | null;
  try {
    event = await providers.calendar.find(request.requestId);
    if (event && event.fingerprint !== fingerprint) return { status: 'failed', message: 'These details changed after confirmation. Review them again before submitting.' };
    if (!event) {
      const slot = await providers.calendar.availability(request.details);
      if (!slot) return { status: 'unavailable', message: 'That requested time is unavailable. Choose another time and review the details again. Nothing was booked.' };
      event = await providers.calendar.reserve(slot, request, fingerprint);
      if (!event) return { status: 'unavailable', message: 'That time became unavailable. Choose another time; nothing was booked.' };
      if (event.fingerprint !== fingerprint) throw new Error('Reservation mismatch.');
    }
  } catch {
    return { status: 'failed', message: 'The calendar could not confirm the booking. Retry this same request to check its status safely; no confirmation was sent.' };
  }
  let customerNotification: 'sent' | 'failed' = 'failed';
  let businessNotification: 'sent' | 'failed' | 'not_configured' = 'not_configured';
  try { await notify(request.details.contactMethod === 'email' ? request.details.email : request.details.phone, event.id, `${request.requestId}:customer`); customerNotification = 'sent'; } catch { /* Retain booking; retry uses the same delivery key. */ }
  if (providers.email && providers.businessEmail) {
    businessNotification = 'failed';
    try { await providers.email(providers.businessEmail, event.id, `${request.requestId}:business`); businessNotification = 'sent'; } catch { /* Never recreate the appointment for an email failure. */ }
  }
  return { status: 'booked', eventId: event.id, customerNotification, businessNotification,
    message: customerNotification === 'sent' ? 'Your appointment is booked and your confirmation was sent. The estimate remains provisional pending staff review.'
      : 'Your appointment is booked, but the confirmation could not be sent. Retry confirmation without creating another appointment.' };
}
