import { VisionAnalysis } from '../app/lib/analysis-schema';
import { JobInputs } from '../app/lib/pricing';

export function sampleInputs(overrides: Partial<JobInputs> = {}): JobInputs {
  return {
    distanceTier: 'under25',
    jobType: 'mixed junk',
    carryDistance: 'short',
    stairs: 'none',
    workers: 1,
    notes: '',
    ...overrides
  };
}

export function sampleAnalysis(overrides: Partial<VisionAnalysis> = {}): VisionAnalysis {
  return {
    estimatedLoadPercent: 50,
    estimatedLoadRange: '40-60% of a 12-yard trailer',
    estimatedLoadCount: 0.5,
    materialType: 'mixed junk',
    materialTypes: ['mixed junk'],
    heavyDebrisRisk: 'low',
    difficulty: 'easy',
    photoAngleQuality: 'good',
    confidencePercent: 90,
    hiddenDebrisRisk: 'low',
    visibleItems: ['chair'],
    observedFacts: ['One chair is visible.'],
    employeeProvidedFacts: [],
    assumptions: ['Loaded volume is compacted.'],
    uncertaintyNotes: [],
    warnings: [],
    questionsToAsk: [],
    ...overrides
  };
}

export function pngFile(name = 'photo.png', bytes = pngBytes()) {
  return new File([bytes], name, { type: 'image/png' });
}

export function jpegFile(name = 'photo.jpg', bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00])) {
  return new File([bytes], name, { type: 'image/jpeg' });
}

export function webpFile(name = 'photo.webp', bytes = webpBytes()) {
  return new File([bytes], name, { type: 'image/webp' });
}

export function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
}

export function webpBytes() {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
}

export function makeForm(overrides: Record<string, string | number> = {}, files: File[] = [pngFile()]) {
  const form = new FormData();
  for (const file of files) {
    form.append('photos', file);
  }
  form.set('distanceTier', String(overrides.distanceTier ?? 'under25'));
  form.set('jobType', String(overrides.jobType ?? 'mixed junk'));
  form.set('carryDistance', String(overrides.carryDistance ?? 'short'));
  form.set('stairs', String(overrides.stairs ?? 'none'));
  form.set('workers', String(overrides.workers ?? 1));
  form.set('notes', String(overrides.notes ?? ''));
  return form;
}

