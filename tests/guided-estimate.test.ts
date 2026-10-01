import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { EMPTY_DETAILS, guidedForm, guidedNotes, ITEM_LOCATIONS, STEPS, stepProblem } from '../app/lib/guided-estimate';
import { validateEstimateForm } from '../app/lib/request-validation';
import { clarificationQuestions } from '../app/lib/clarification';
import { priceJob } from '../app/lib/pricing';
import { buildAnalysisPrompt } from '../app/lib/openai-analysis';
import { makeForm, pngFile, sampleAnalysis, sampleInputs } from './helpers';
import { GET } from '../app/api/estimate-location/route';
import { isResolvedLocation, LOCATION_REQUIRED, tierForDrivingMiles } from '../app/lib/location-resolution';
import { resolveCity } from '../app/lib/city-directory';
import { determineQuoteStatus } from '../app/lib/quote-status';

const details = { ...EMPTY_DETAILS, location: resolveCity('geonames:5364514')!, jobTypes: ['furniture', 'appliances'], itemLocation: 'Garage', carryDistance: 'short', stairs: 'none', notes: 'All shown items included; all items easily carried by one person.' };
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
    expect(form.has('distanceTier')).toBe(false); expect(form.get('cityId')).toBe(details.location.id); expect(form.get('carryDistance')).toBe('short'); expect(form.get('stairs')).toBe('none');
    expect(form.has('workers')).toBe(false); expect(form.get('notes')).toContain('Item location: Garage.');
    expect(form.get('notes')).toContain(details.notes);
    expect(form.getAll('jobType')).toEqual(['furniture', 'appliances']);
    for (let i = 0; i < 10; i++) form.append('photos', pngFile(`synthetic-${i}.png`));
    // Selected cities remain usable without inventing unknown distances.
    expect(await validateEstimateForm(form)).toMatchObject({ ok: false, reviewLocation: details.location });
    // The existing internal API contract still accepts explicitly supplied staff tiers.
    form.delete('workflow');
    form.delete('cityId'); form.delete('directoryVersion'); form.delete('routeVersion'); form.set('distanceTier', 'under25');
    const result = await validateEstimateForm(form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.photos).toHaveLength(10); expect(result.value.inputs.workers).toBeNull();
      expect(buildAnalysisPrompt(result.value.inputs)).toContain('"workers":null');
      expect(result.value.inputs.jobTypes).toEqual(['furniture', 'appliances']);
      expect(buildAnalysisPrompt(result.value.inputs)).toContain('"jobTypes":["furniture","appliances"]');
      expect(determineQuoteStatus(result.value.inputs, sampleAnalysis()).status).toBe('needs_manager_review');
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
    const concern = { ...analysis, observedFacts: ['Sealed boxes beside a bolted cabinet.'], questionsToAsk: ['What is inside the boxes?', 'Need disassembly?'] };
    expect(clarificationQuestions(concern, '').map((q) => q.id)).toEqual(['contents', 'dismantling']);
    expect(clarificationQuestions(concern, '', [{ id: 'contents', answer: 'lightweight decorations', notSure: false }, { id: 'dismantling', answer: 'no', notSure: false }])).toEqual([]);
    expect(clarificationQuestions(concern, '', [{ id: 'contents', answer: '', notSure: true }]).length).toBeGreaterThan(0);
    expect(priceJob(sampleInputs({ workers: null }), analysis)).toEqual(priceJob(sampleInputs({ workers: 6 }), analysis));
  });
  it('offers local cities without credentials, without treating names as routing evidence', async () => {
    const response = await GET(new Request('http://localhost/api/estimate-location?query=Lake%20Forest')); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).suggestions[0].label).toBe('Lake Forest, Orange County, CA');
    for (const miles of [-1, NaN, Infinity, 65.01]) expect(tierForDrivingMiles(miles)).toBeNull();
    expect([0, 25, 25.01, 40, 40.01, 65].map(tierForDrivingMiles)).toEqual(['under25', 'under25', '25to40', '25to40', '40to65', '40to65']);
    expect(isResolvedLocation({ label: 'Rancho Mission Viejo', state: 'CA' })).toBe(false);
    expect(isResolvedLocation({ ...details.location, id: 'Lake Forest' })).toBe(false);
    expect(() => guidedForm({ ...details, location: null })).toThrow(LOCATION_REQUIRED);
  });
  it('rejects duplicate/invalid multi-select entries and applies cardboard-only rules only to an exclusively cardboard job', async () => {
    for (const extra of ['mixed junk', 'invented category']) {
      const form = makeForm(); form.append('jobType', extra); expect((await validateEstimateForm(form)).ok).toBe(false);
    }
    const mixed = sampleInputs({ jobType: 'cardboard only, appliances', jobTypes: ['cardboard only', 'appliances'] });
    expect(priceJob(mixed, sampleAnalysis()).adjustments).toBe(0);
    expect(determineQuoteStatus(mixed, sampleAnalysis()).status).toBe('needs_manager_review');
    expect(priceJob(sampleInputs({ jobType: 'cardboard only', jobTypes: ['cardboard only'] }), sampleAnalysis()).adjustments).toBe(-40);
  });
  it('ignores unsupported boilerplate and negated observations but preserves essential unresolved scope and unknowns', () => {
    const generic = sampleAnalysis({ questionsToAsk: ['Anything hidden?', 'What is inside the boxes?', 'Need disassembly?'], uncertaintyNotes: ['Maybe hidden material.', 'Unknown contents.'] });
    expect(clarificationQuestions(generic, '')).toEqual([]);
    expect(clarificationQuestions({ ...generic, observedFacts: ['No closed boxes or bags.'] }, '')).toEqual([]);
    expect(clarificationQuestions(generic, '', [], 1, ['dimensions']).map((q) => q.id)).toEqual(['dimensions']);
    const supported = { ...generic, observedFacts: ['Closed boxes obscure the view behind the pile.'] };
    expect(clarificationQuestions(supported, '').map((q) => q.id)).toEqual(['hidden', 'contents']);
    expect(clarificationQuestions(supported, 'Nothing hidden. Boxes contain lightweight decorations.')).toEqual([]);
  });
});
