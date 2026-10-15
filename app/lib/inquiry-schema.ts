import { z } from 'zod';
import { SERVICE_CHOICES } from './conversation-schema';

export const inquirySchema = z.object({
  phone: z.string().trim().max(30).regex(/^\+?[\d\s().-]+$/, 'Enter a valid phone number.')
    .transform(value => value.replace(/\D/g, ''))
    .refine(value => /^(?:1)?[2-9]\d{2}[2-9]\d{6}$/.test(value), 'Enter a valid US phone number.')
    .transform(value => `+1${value.slice(-10)}`),
  email: z.string().trim().max(254).email('Enter a valid email address.'),
  services: z.array(z.string()).min(1).max(SERVICE_CHOICES.length)
    .refine(values => new Set(values).size === values.length && values.every(value => SERVICE_CHOICES.some(([id]) => id === value)), 'Choose a listed service.')
}).strict();
export type Inquiry = z.infer<typeof inquirySchema>;
