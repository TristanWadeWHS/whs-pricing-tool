'use client';

import { useEffect, useRef, useState } from 'react';
import { CARRIES, DISTANCES, EMPTY_DETAILS, guidedForm, guidedNotes, ITEM_LOCATIONS, JOB_TYPES, STAIRS, STEPS, stepProblem, type GuidedDetails } from './lib/guided-estimate';
import { MAX_ESTIMATE_PHOTOS } from './lib/estimate-limits';
import { LocationSearch } from './location-search';
import { tierForDrivingMiles, LOCATION_BLOCKER } from './lib/location-resolution';

export function GuidedJobForm({ disabled, photoStatus, photoMessage, photoCount, onPhotos, onAnalyze }: {
  disabled: boolean; photoStatus: string; photoMessage: string; photoCount: number;
  onPhotos(files: FileList | null): void; onAnalyze(form: FormData): Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<GuidedDetails>(EMPTY_DETAILS);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step > 0) heading.current?.focus(); }, [step]);
  function update(key: 'area' | 'itemLocation' | 'carryDistance' | 'stairs' | 'notes', value: string) { setDetails((old) => ({ ...old, [key]: value })); setError(''); }
  function choices(key: 'itemLocation' | 'carryDistance' | 'stairs', legend: string, options: readonly (readonly [string, string])[]) {
    return <fieldset className="choices"><legend>{legend}</legend><div className="choiceGrid">{options.map(([value, label]) =>
      <label className="choice" key={value}><input type="radio" name={key} value={value} checked={details[key] === value} onChange={() => update(key, value)} /><span>{label}</span></label>
    )}</div></fieldset>;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (disabled) return;
    const problem = stepProblem(step, details, photoStatus === 'ready');
    if (problem) { setError(problem); return; }
    if (step < 5) { setError(''); setStep(step + 1); return; }
    try { await onAnalyze(guidedForm(details)); } catch { setError('Check the job details and try again. Your entries are retained.'); }
  }
  return <section className={`guided ${step === 0 ? 'welcomeStep' : ''}`} aria-label="Job details">
    <ol className="stepTrack" aria-label="Estimate steps">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span><b>{label}</b></li>)}</ol>
    <form onSubmit={submit}>
      <fieldset key={step} className={`jobFields ${step === 1 ? 'spiralEntry' : ''}`} disabled={disabled}>
        <p className="stepKicker">Step {step + 1} of {STEPS.length}</p>
        <h2 ref={heading} tabIndex={-1}>{['Let\u2019s take a look!', 'Where is the job?', 'What are we removing?', 'Where are the items?', 'Show us the scope.', 'Notes and review'][step]}</h2>
        {step === 0 && <div className="welcome"><img src="/winston-logo.png" width="160" height="160" alt="Winston, Wade Home Services" /><p>Job photos and a few details.<br />An internal estimate, reviewed by your team.</p><p className="helperText">Staff approval is required before quoting a customer.</p></div>}
        {step === 1 && <>
          <LocationSearch query={details.area} selected={details.location} onChange={(area, location) => { setDetails((old) => ({ ...old, area, location })); setError(''); }} />
          <p className="helperText">Service distance starts from Rancho Mission Viejo. A city-level route is not an exact driving distance to the job address.</p>
          {!details.location && <button type="button" className="secondary" onClick={() => { setError(''); setStep(2); }}>Review other steps while location is unresolved</button>}
        </>}
        {step === 2 && <fieldset className="choices"><legend>Job types (select all that apply)</legend><div className="choiceGrid">{JOB_TYPES.map((value) =>
          <label className="choice" key={value}><input type="checkbox" name="jobType" value={value} checked={details.jobTypes.includes(value)} onChange={(event) => {
            const checked = event.target.checked;
            setDetails((old) => ({ ...old, jobTypes: checked ? [...old.jobTypes, value] : old.jobTypes.filter((type) => type !== value) })); setError('');
          }} /><span>{value.charAt(0).toUpperCase() + value.slice(1)}</span></label>
        )}</div></fieldset>}
        {step === 3 && <>
          {choices('itemLocation', 'Item location', ITEM_LOCATIONS.map((value) => [value, value]))}
          {details.itemLocation && <div className="accessFollowup">
            {choices('carryDistance', 'How far will items be carried?', CARRIES)}
            {choices('stairs', 'What stairs are on the removal route?', STAIRS)}
            <p className="helperText">Choose the actual route, including any elevator access. A floor number alone does not establish stairs or carry distance.</p>
          </div>}
        </>}
        {step === 4 && <>
          <label className="photoPicker">Job photos, 1-{MAX_ESTIMATE_PHOTOS} images<input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple aria-describedby="photo-help photo-status" onChange={(e) => onPhotos(e.target.files)} /></label>
          <p id="photo-help" className="helperText">Include the full removal scope and different angles of the same items. {photoCount ? `${photoCount} image(s) selected.` : 'Choose up to 10 images.'}</p>
          <p id="photo-status" role="status" aria-live="polite" className={photoStatus === 'error' ? 'photoErrorText' : 'helperText'}>{photoMessage}</p>
          <p className="helperText">Photos stay within the existing safe upload budget. If they cannot fit without losing too much detail, choose fewer photos.</p>
        </>}
        {step === 5 && <>
          <label className="fieldLabel">Anything else we should know?<textarea name="notes" maxLength={800} value={details.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Contents of boxes, items to leave behind, handling equipment needed, or confirmed dimensions..." /></label>
          <dl className="reviewList">
            <div><dt>Location</dt><dd>{details.location?.label || details.area || 'Location unresolved'} / {details.location ? DISTANCES.find(([value]) => value === tierForDrivingMiles(details.location!.drivingMiles))?.[1] : 'No distance tier resolved'}</dd></div>
            <div><dt>Job types</dt><dd>{details.jobTypes.join(', ')}</dd></div>
            <div><dt>Access</dt><dd>{details.itemLocation} / {CARRIES.find(([value]) => value === details.carryDistance)?.[1]} / {STAIRS.find(([value]) => value === details.stairs)?.[1]}</dd></div>
            <div><dt>Photos</dt><dd>{photoCount} selected {photoStatus === 'ready' ? 'and optimized' : '(not ready)'}</dd></div>
          </dl>
          <p className="helperText">{guidedNotes(details).length}/1000 context characters. Only the shown and confirmed removal scope will be submitted.</p>
          {!details.location && <p role="alert">{LOCATION_BLOCKER}</p>}
        </>}
        {error && <p role="alert" className="photoErrorText">{error}</p>}
        <div className="stepActions">
          {step > 0 && <button type="button" className="secondary" onClick={() => { setError(''); setStep(step - 1); }}>Back</button>}
          <button type="submit" disabled={photoStatus === 'optimizing' || (step >= 4 && photoStatus !== 'ready') || (step === 5 && !details.location)}>
            {step === 0 ? 'Start estimate' : step === 5 ? 'Analyze Job' : 'Continue'}
          </button>
        </div>
      </fieldset>
    </form>
  </section>;
}
