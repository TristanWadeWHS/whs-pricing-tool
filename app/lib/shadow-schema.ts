import { z } from 'zod';

export const questionIdSchema = z.enum(['hidden', 'contents', 'dismantling', 'dimensions']);
const range = z.object({ min: z.number().positive().max(1000), max: z.number().positive().max(1000) }).strict();
const evidence = z.object({
  source: z.enum(['photo_estimate', 'employee_report', 'employee_measurement', 'unknown']),
  // Employee evidence must quote the original notes or a clarification answer verbatim.
  excerpt: z.string().max(400)
}).strict();
export const shadowEvidenceSchema = z.object({
  items: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    kind: z.enum(['item', 'group', 'pile']),
    parentId: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/).nullable(),
    quantity: z.number().int().min(1).max(200).nullable(),
    quantityEvidence: evidence,
    photoRefs: z.array(z.number().int().min(1).max(5)).min(1).max(5),
    overlap: z.enum(['distinct', 'uncertain']),
    identification: z.enum(['identified', 'unknown']),
    material: z.enum(['ordinary', 'dense', 'restricted', 'unknown']),
    dimensions: z.object({
      length: range, width: range, height: range,
      unit: z.enum(['in', 'ft', 'yd', 'cm', 'm']),
      state: z.enum(['as_is', 'after_disassembly']),
      evidence
    }).strict().nullable(),
    packing: z.object({
      basis: z.enum(['loaded_envelope', 'explicit_factor', 'unknown']),
      factor: range.nullable(),
      disassembly: z.enum(['none_required', 'confirmed', 'unknown']),
      evidence
    }).strict()
  }).strict()).max(30),
  contradictions: z.array(z.object({
    questionId: questionIdSchema,
    photoRef: z.number().int().min(1).max(5),
    region: z.enum(['foreground', 'background', 'left', 'right', 'center']),
    kind: z.enum(['additional_material_visible', 'different_contents_visible', 'fastener_visible', 'dimension_reference_disagrees']),
    observation: z.string().min(12).max(220),
    contradicts: z.string().min(2).max(400)
  }).strict()).max(8)
}).strict();
export type ShadowEvidence = z.infer<typeof shadowEvidenceSchema>;
export type InventoryItem = ShadowEvidence['items'][number];

export function shadowPreviewEnabled() {
  return process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development';
}
