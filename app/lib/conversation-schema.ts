import { z } from 'zod';
import { visionAnalysisSchema } from './analysis-schema';

export const SERVICE_CHOICES = [
  ['mixed junk', 'Junk pickup'], ['furniture', 'Furniture'], ['demo debris', 'Light demolition'],
  ['appliances', 'Appliances'], ['cardboard only', 'Cardboard'], ['storage relocation', 'Storage relocation'],
  ['concrete / dirt / heavy debris', 'Heavy materials']
] as const;
const id = z.string().regex(/^i_[a-z0-9_]{1,40}$/);
const shortText = z.string().min(1).max(180);
export const itemSchema = z.object({ id, label: shortText, room: z.string().max(60),
  photoRefs: z.array(z.number().int().min(1).max(10)).min(1).max(10), duplicateOf: id.nullable() }).strict();
export const questionSchema = z.object({ itemId: id, topic: z.enum(['contents', 'dimensions', 'dismantling']),
  text: shortText, evidence: shortText, photoRef: z.number().int().min(1).max(10) }).strict();
export const conversationModelSchema = z.object({
  overlapUnresolved: z.boolean(),
  items: z.array(itemSchema).max(40), analysis: visionAnalysisSchema,
  pricedItemIds: z.array(id).max(40), questions: z.array(questionSchema).max(6),
  conflicts: z.array(z.object({ itemId: id, contradicts: z.string().min(1).max(400), evidence: shortText, photoRef: z.number().int().min(1).max(10) }).strict()).max(6),
  scopeChanges: z.array(z.object({ itemId: id, excerpt: shortText }).strict()).max(10)
}).strict();
export type ConversationModel = z.infer<typeof conversationModelSchema>;
export type Choice = 'included' | 'excluded' | 'unresolved';
export type ScopeItem = Omit<z.infer<typeof itemSchema>, 'duplicateOf'> & { choice: Choice };
export type Question = z.infer<typeof questionSchema> & { id: string };
export type Answer = { id: string; text: string; notSure: boolean };
export type ConversationState = { version: 1; expires: number; turn: number;
  messages: { text: string; room: string }[]; services: string[]; photoHashes: string[]; photoRooms: string[];
  items: ScopeItem[]; questions: Question[]; answers: Answer[];
  completedEstimate?: { percent: number; rangeText: string; exceptional: boolean } };
export type ConversationResult = { token: string; message: string; items: ScopeItem[]; questions: Question[];
  baseline: ReturnType<typeof import('./pricing').volumeBaseline> | null;
  reasons: string[]; assumptions: string[]; review: boolean; error?: string };
