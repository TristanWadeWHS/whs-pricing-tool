'use client';

import { useEffect, useRef, useState } from 'react';
import { CARRIES, DISTANCES, EMPTY_DETAILS, guidedForm, guidedNotes, ITEM_LOCATIONS, JOB_TYPES, STAIRS, STEPS, stepProblem, type GuidedDetails } from './lib/guided-estimate';
import { MAX_ESTIMATE_PHOTOS } from './lib/estimate-limits';

export function GuidedJobForm({ disabled, photoStatus, photoMessage, photoCount, onPhotos, onAnalyze }: {
  disabled: boolean; photoStatus: string; photoMessage: string; photoCount: number;
  onPhotos(files: FileList | null): void; onAnalyze(form: FormData): Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<GuidedDetails>(EMPTY_DETAILS);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step > 0) heading.current?.focus(); }, [step]);
  function update(key: keyof GuidedDetails, value: string) { setDetails((old) => ({ ...old, [key]: value })); setError(''); }
  function choices(key: keyof GuidedDetails, legend: string, options: readonly (readonly [string, string])[]) {
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
  return <section className="guided" aria-label="Job details">
    <ol className="stepTrack" aria-label="Estimate steps">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span><b>{label}</b></li>)}</ol>
    <form onSubmit={submit}>
      <fieldset className="jobFields" disabled={disabled}>
        <p className="stepKicker">Step {step + 1} of {STEPS.length}</p>
        <h2 ref={heading} tabIndex={-1}>{['Let\'s take a look.', 'Where is the job?', 'What are we removing?', 'Where are the items?', 'Show us the scope.', 'Notes and review'][step]}</h2>
        {step === 0 && <div className="welcome"><img src="/winston-logo.png" width="160" height="160" alt="Winston, Wade Home Services" /><p>Job photos and a few details.<br />An internal estimate, reviewed by your team.</p><p className="helperText">Staff approval is required before quoting a customer.</p></div>}
        {step === 1 && <>
          <label className="fieldLabel">City or neighborhood (optional)<input name="area" autoComplete="off" maxLength={80} value={details.area} onChange={(e) => update('area', e.target.value)} /></label>
          {choices('distanceTier', 'Distance tier', DISTANCES)}
          <p className="helperText">Use the existing WHS service-distance tier. Driving distance is not calculated here. Unsure? Confirm with staff.</p>
        </>}
        {step === 2 && choices('jobType', 'Job type', JOB_TYPES.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1)]))}
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
            <div><dt>Location</dt><dd>{details.area || 'Area not provided'} / {DISTANCES.find(([value]) => value === details.distanceTier)?.[1]}</dd></div>
            <div><dt>Job type</dt><dd>{details.jobType}</dd></div>
            <div><dt>Access</dt><dd>{details.itemLocation} / {CARRIES.find(([value]) => value === details.carryDistance)?.[1]} / {STAIRS.find(([value]) => value === details.stairs)?.[1]}</dd></div>
            <div><dt>Photos</dt><dd>{photoCount} selected {photoStatus === 'ready' ? 'and optimized' : '(not ready)'}</dd></div>
          </dl>
          <p className="helperText">{guidedNotes(details).length}/1000 context characters. Only the shown and confirmed removal scope will be submitted.</p>
        </>}
        {error && <p role="alert" className="photoErrorText">{error}</p>}
        <div className="stepActions">
          {step > 0 && <button type="button" className="secondary" onClick={() => { setError(''); setStep(step - 1); }}>Back</button>}
          <button type="submit" disabled={photoStatus === 'optimizing' || (step >= 4 && photoStatus !== 'ready')}>
            {step === 0 ? 'Start estimate' : step === 5 ? 'Analyze Job' : 'Continue'}
          </button>
        </div>
      </fieldset>
    </form>
  </section>;
}
