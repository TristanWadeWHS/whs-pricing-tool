import type { InventoryItem, ShadowEvidence } from '../app/lib/shadow-schema';
import type { ClarificationAnswer } from '../app/lib/clarification';

export const dimensionNote = 'Loaded crates are 3 ft by 3 ft by 3 to 4 ft including voids. No disassembly required.';
export const tristanAnswers: ClarificationAnswer[] = [
  { id: 'contents', answer: 'Boxes contain lightweight Christmas decorations.', notSure: false },
  { id: 'hidden', answer: 'Nothing underneath. Nothing outside the photographed scope.', notSure: false },
  { id: 'dismantling', answer: 'No disassembly required.', notSure: false },
  { id: 'dimensions', answer: '', notSure: true }
];
export function inventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return { id: 'crates', kind: 'group', parentId: null, quantity: 2, photoRefs: [1], overlap: 'distinct',
    quantityEvidence: { source: 'photo_estimate', excerpt: '' },
    identification: 'identified', material: 'ordinary',
    dimensions: { length: { min: 3, max: 3 }, width: { min: 3, max: 3 }, height: { min: 3, max: 4 }, unit: 'ft',
      state: 'as_is', evidence: { source: 'employee_report', excerpt: dimensionNote } },
    packing: { basis: 'loaded_envelope', factor: null, disassembly: 'none_required',
      evidence: { source: 'employee_report', excerpt: dimensionNote } }, ...overrides };
}
export function inventory(items = [inventoryItem()]): ShadowEvidence { return { items, contradictions: [] }; }
