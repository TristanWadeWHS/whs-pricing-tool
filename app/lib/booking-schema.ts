import { z } from 'zod';
import type { Promotion } from './promotion';

export const customerTypeSchema = z.enum(['new', 'returning']);
export type CustomerType = z.infer<typeof customerTypeSchema>;
const text = (max: number) => z.string().trim().min(1).max(max).refine((s) => !/[\u0000-\u001f]/.test(s));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const parsed = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}, 'Enter a valid date.');
export const bookingDetailsSchema = z.object({
  name: text(100), address: text(250), date,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  contactMethod: z.enum(['email', 'text']),
  email: z.union([z.literal(''), z.email().max(254)]),
  phone: z.string().trim().max(30).refine((s) => !s || (/^\+?[\d\s().-]+$/.test(s) && s.replace(/\D/g, '').length >= 10 && s.replace(/\D/g, '').length <= 15), 'Enter a valid phone number.'),
}).strict().superRefine((value, context) => {
  if (value.contactMethod === 'email' && !value.email) context.addIssue({ code: 'custom', path: ['email'], message: 'Email is required for email confirmation.' });
  if (value.contactMethod === 'text' && !value.phone) context.addIssue({ code: 'custom', path: ['phone'], message: 'A phone number is required for text confirmation.' });
});
export type BookingDetails = z.infer<typeof bookingDetailsSchema>;
export function futurePreference(details: BookingDetails, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${details.date}T${details.time}` > `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export type PromotionReply = { customerType: CustomerType; promotion: Promotion; message: string; bookingEnabled: boolean; bookingNotice: string };
export type BookingOutcome = { status: 'disabled' | 'review_required' | 'unavailable' | 'failed' | 'booked'; message: string;
  eventId?: string; customerNotification?: 'sent' | 'failed'; businessNotification?: 'sent' | 'failed' | 'not_configured' };
