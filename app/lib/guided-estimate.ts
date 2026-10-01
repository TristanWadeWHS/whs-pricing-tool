import { ESTIMATE_LIMITS } from './request-validation';

export const STEPS = ['Welcome', 'Location', 'Job type', 'Access', 'Photos', 'Review'] as const;
export const DISTANCES = [['under25', 'Within 25 miles'], ['25to40', '25-40 miles'], ['40to65', '40-65 miles']] as const;
export const CARRIES = [['curbside', 'Curbside / driveway'], ['short', 'Short carry'], ['medium', 'Medium carry'], ['long', 'Long carry / backyard / difficult access']] as const;
export const STAIRS = [['none', 'No stairs'], ['some', 'Some stairs'], ['heavy', 'Heavy stairs / upstairs furniture']] as const;
export const ITEM_LOCATIONS = ['Curbside', 'Driveway', 'Garage', 'First floor', 'Second floor', 'Yard', 'Other / multiple areas'] as const;
export const JOB_TYPES = ESTIMATE_LIMITS.supportedJobTypes;
export type GuidedDetails = { area: string; distanceTier: string; jobType: string; itemLocation: string; carryDistance: string; stairs: string; notes: string };
export const EMPTY_DETAILS: GuidedDetails = { area: '', distanceTier: '', jobType: '', itemLocation: '', carryDistance: '', stairs: '', notes: '' };

export function guidedNotes(details: GuidedDetails) {
  return [details.area.trim() && `Job area: ${details.area.trim()}.`, details.itemLocation && `Item location: ${details.itemLocation}.`, details.notes.trim()].filter(Boolean).join('\n');
}

export function stepProblem(step: number, details: GuidedDetails, photosReady: boolean): string | null {
  if (step === 1 && !DISTANCES.some(([value]) => value === details.distanceTier)) return 'Confirm the distance tier with staff before continuing.';
  if (step === 2 && !JOB_TYPES.some((value) => value === details.jobType)) return 'Choose the job type.';
  if (step === 3 && (!ITEM_LOCATIONS.some((value) => value === details.itemLocation) || !CARRIES.some(([value]) => value === details.carryDistance) || !STAIRS.some(([value]) => value === details.stairs))) return 'Confirm the item location, carry distance and stairs. Unknown access needs staff confirmation, not a guessed charge.';
  if (step === 4 && !photosReady) return 'Choose photos and wait for optimization to finish.';
  if (step === 5 && (details.area.length > 80 || guidedNotes(details).length > ESTIMATE_LIMITS.maxNotesLength)) return 'Shorten the job area or notes before continuing.';
  return null;
}

export function guidedForm(details: GuidedDetails) {
  for (const step of [1, 2, 3, 5]) { const problem = stepProblem(step, details, true); if (problem) throw new Error(problem); }
  const form = new FormData();
  for (const key of ['distanceTier', 'jobType', 'carryDistance', 'stairs'] as const) form.set(key, details[key]);
  form.set('notes', guidedNotes(details));
  return form;
}
