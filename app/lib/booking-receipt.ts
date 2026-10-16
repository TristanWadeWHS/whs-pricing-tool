import { z } from 'zod';

export const bookingReceiptSchema = z.object({
  ok: z.literal(true), pending: z.literal(true),
  leadId: z.string().regex(/^AI-[0-9a-f-]{36}$/i),
  requestId: z.uuid(), requestedTime: z.string().trim().min(1).max(200),
});

export function verifiedBookingReceipt(value: unknown, estimateId: string, requestId: string) {
  const receipt = bookingReceiptSchema.parse(value);
  if (receipt.leadId !== `AI-${estimateId}` || receipt.requestId !== requestId) {
    throw new Error('Booking receipt does not match this request.');
  }
  return receipt;
}
