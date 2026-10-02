import { ESTIMATE_LIMITS } from './request-validation';
import { validStaffAddOns } from './pricing';
import { isResolvedLocation, LOCATION_REQUIRED, type ResolvedLocation } from './location-resolution';

export const STEPS = ['Welcome', 'Location', 'Job type', 'Access', 'Photos', 'Review'] as const;
export const DISTANCES = [['under25', 'Within 25 miles'], ['25to40', '25-40 miles'], ['40to65', '40-65 miles']] as const;
export const CARRIES = [['curbside', 'Curbside / driveway'], ['short', 'Short carry'], ['medium', 'Medium carry'], ['long', 'Long carry / backyard / difficult access']] as const;
export const STAIRS = [['none', 'No stairs'], ['some', 'Some stairs'], ['heavy', 'Heavy stairs / upstairs furniture']] as const;
export const ITEM_LOCATIONS = ['Curbside', 'Driveway', 'Garage', 'First floor', 'Second floor', 'Yard', 'Other / multiple areas'] as const;
export const JOB_TYPES = ESTIMATE_LIMITS.supportedJobTypes;
export type GuidedDetails = { area: string; location: ResolvedLocation | null; staffDistanceTier: string; staffAddOns?: string[]; jobTypes: string[]; itemLocation: string; carryDistance: string; stairs: string; notes: string };
export const EMPTY_DETAILS: GuidedDetails = { area: '', location: null, staffDistanceTier: '', jobTypes: [], itemLocation: '', carryDistance: '', stairs: '', notes: '' };

export function guidedNotes(details: GuidedDetails) {
  return [details.location && `Job area: ${details.location.label}.`, details.itemLocation && `Item location: ${details.itemLocation}.`, details.notes.trim()].filter(Boolean).join('\n');
}

export function stepProblem(step: number, details: GuidedDetails, photosReady: boolean): string | null {
  if (step === 1 && !isResolvedLocation(details.location)) return LOCATION_REQUIRED;
  if (step === 2 && (!details.jobTypes.length || new Set(details.jobTypes).size !== details.jobTypes.length || !details.jobTypes.every((type) => JOB_TYPES.some((value) => value === type)))) return 'Choose one or more job types.';
  if (step === 3 && (!ITEM_LOCATIONS.some((value) => value === details.itemLocation) || !CARRIES.some(([value]) => value === details.carryDistance) || !STAIRS.some(([value]) => value === details.stairs))) return 'Confirm the item location, carry distance and stairs. Unknown access needs staff confirmation, not a guessed charge.';
  if (step === 4 && !photosReady) return 'Choose photos and wait for optimization to finish.';
  if (step === 5 && guidedNotes(details).length > ESTIMATE_LIMITS.maxNotesLength) return 'Shorten the notes before continuing.';
  if (step === 5 && !validStaffAddOns(details, details.staffAddOns ?? [])) return 'Review the selected staff-approved access add-ons.';
  if (step === 5 && details.location?.status === 'staff_review_required'
    && !DISTANCES.some(([tier]) => tier === details.staffDistanceTier)) return 'Select a staff-confirmed distance tier before analysis.';
  return null;
}

export function guidedForm(details: GuidedDetails) {
  for (const step of [1, 2, 3, 5]) { const problem = stepProblem(step, details, true); if (problem) throw new Error(problem); }
  const form = new FormData();
  form.set('workflow', 'guided-city-v3');
  form.set('cityId', details.location!.id);
  form.set('directoryVersion', details.location!.directoryVersion);
  form.set('routeVersion', details.location!.routeVersion);
  if (details.location!.status === 'staff_review_required') form.set('staffDistanceTier', details.staffDistanceTier);
  for (const type of details.jobTypes) form.append('jobType', type);
  for (const key of ['carryDistance', 'stairs'] as const) form.set(key, details[key]);
  form.set('notes', guidedNotes(details));
  for (const id of details.staffAddOns ?? []) form.append('staffAddOn', id);
  return form;
}
