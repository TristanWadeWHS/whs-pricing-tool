import { describe, expect, it } from 'vitest';
import { EMPTY_DETAILS, guidedForm, guidedNotes, ITEM_LOCATIONS, STEPS, stepProblem } from '../app/lib/guided-estimate';
import { validateEstimateForm } from '../app/lib/request-validation';
import { clarificationQuestions } from '../app/lib/clarification';
import { priceJob } from '../app/lib/pricing';
import { buildAnalysisPrompt } from '../app/lib/openai-analysis';
import { makeForm, pngFile, sampleAnalysis, sampleInputs } from './helpers';

const details = { ...EMPTY_DETAILS, distanceTier: 'under25', jobType: 'mixed junk', itemLocation: 'Garage', carryDistance: 'short', stairs: 'none', notes: 'All shown items included; all items easily carried by one person.' };
describe('guided estimate field mapping', () => {
  it('requires explicit selections and never derives route facts from a location', () => {
    expect(STEPS).toHaveLength(6);
    expect(stepProblem(1, EMPTY_DETAILS, false)).toBeTruthy();
    expect(stepProblem(2, EMPTY_DETAILS, false)).toBeTruthy();
    for (const itemLocation of ITEM_LOCATIONS) {
      const incomplete = { ...EMPTY_DETAILS, itemLocation };
      expect(stepProblem(3, incomplete, false)).toBeTruthy();
      expect(incomplete.carryDistance).toBe(''); expect(incomplete.stairs).toBe('');
    }
    expect(stepProblem(3, { ...details, itemLocation: 'Second floor', stairs: 'none' }, true)).toBeNull();
    expect(stepProblem(4, details, false)).toBeTruthy();
    expect(stepProblem(4, details, true)).toBeNull();
  });
  it('sends exact enums and context, without guessed workers or inferred driving distances', async () => {
    const form = guidedForm({ ...details, area: 'Synthetic area' });
    expect(form.get('distanceTier')).toBe('under25'); expect(form.get('carryDistance')).toBe('short'); expect(form.get('stairs')).toBe('none');
    expect(form.has('workers')).toBe(false); expect(form.get('notes')).toContain('Item location: Garage.');
    expect(form.get('notes')).toContain(details.notes);
    for (let i = 0; i < 10; i++) form.append('photos', pngFile(`synthetic-${i}.png`));
    const result = await validateEstimateForm(form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.photos).toHaveLength(10); expect(result.value.inputs.workers).toBeNull();
      expect(buildAnalysisPrompt(result.value.inputs)).toContain('"workers":null');
      expect(priceJob(result.value.inputs, sampleAnalysis())).toEqual(priceJob({ ...result.value.inputs, workers: 1 }, sampleAnalysis()));
    }
  });
  it('keeps explicit malformed crew inputs invalid and bounds combined notes', async () => {
    const form = makeForm(); form.set('workers', '');
    expect((await validateEstimateForm(form)).ok).toBe(false);
    expect(() => guidedForm({ ...details, notes: 'x'.repeat(1000) })).toThrow();
    expect(guidedNotes({ ...details, area: 'a'.repeat(80), notes: 'n'.repeat(800) }).length).toBeLessThanOrEqual(1000);
  });
  it('does not fall back to generic questions; asks only reported, unresolved concerns', () => {
    const analysis = sampleAnalysis({ confidencePercent: 73, warnings: [], uncertaintyNotes: [], questionsToAsk: [] });
    expect(clarificationQuestions(analysis, '')).toEqual([]);
    const concern = { ...analysis, questionsToAsk: ['What is inside the boxes?', 'Need disassembly?'] };
    expect(clarificationQuestions(concern, '').map((q) => q.id)).toEqual(['contents', 'dismantling']);
    expect(clarificationQuestions(concern, '', [{ id: 'contents', answer: 'lightweight decorations', notSure: false }, { id: 'dismantling', answer: 'no', notSure: false }])).toEqual([]);
    expect(clarificationQuestions(concern, '', [{ id: 'contents', answer: '', notSure: true }]).length).toBeGreaterThan(0);
    expect(priceJob(sampleInputs({ workers: null }), analysis)).toEqual(priceJob(sampleInputs({ workers: 6 }), analysis));
  });
});
