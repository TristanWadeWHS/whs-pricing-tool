'use client';

import { useEffect, useRef, useState } from 'react';
import { HistoricalReference } from './historical-reference';
import { ShadowDiagnostics } from './shadow-diagnostics';
import { GuidedJobForm } from './guided-job-form';
import { DISTANCES } from './lib/guided-estimate';
import { canDisplayEstimate, failedResult, readAnalyzeResponse, type Result } from './lib/analyze-client';
import { ANALYSIS_CONFIDENCE_LABEL, ANALYSIS_CONFIDENCE_NOTE } from './lib/analysis-confidence';
import { getPhotoSizeRejection } from './lib/estimate-limits';
import {
  buildAnalyzeFormWithOptimizedPhotos,
  optimizePhotoSelection,
  OPTIMIZATION_MESSAGES,
  type OptimizedPhoto
} from './lib/photo-optimizer';

type PhotoState =
  | { status: 'idle'; message: string; photos: OptimizedPhoto[] }
  | { status: 'optimizing'; message: string; photos: OptimizedPhoto[] }
  | { status: 'ready'; message: string; photos: OptimizedPhoto[] }
  | { status: 'error'; message: string; photos: OptimizedPhoto[] };

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [photoState, setPhotoState] = useState<PhotoState>({ status: 'idle', message: '', photos: [] });
  const selectionId = useRef(0);
  const originalForm = useRef<FormData | null>(null);
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const busyRegion = useRef<HTMLDivElement>(null);
  const resultRegion = useRef<HTMLElement>(null);
  const [answers, setAnswers] = useState<Record<string, { answer: string; notSure: boolean }>>({});
  const [clarificationError, setClarificationError] = useState('');
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [formVersion, setFormVersion] = useState(0);
  const clarifying = Boolean(result?.clarification);
  const withheld = Boolean(result?.priceWithheld) || result?.status === 'analysis_failed';

  useEffect(() => {
    if (loading) busyRegion.current?.focus();
    else if (result) resultRegion.current?.focus();
  }, [loading, result]);

  useEffect(() => {
    return () => {
      selectionId.current += 1;
      requestId.current += 1;
      activeRequest.current?.abort();
    };
  }, []);

  async function handlePhotoChange(files: FileList | null) {
    cancelAnalysis();
    const selectedFiles = Array.from(files || []);
    const currentSelectionId = selectionId.current + 1;
    selectionId.current = currentSelectionId;
    setFileCount(selectedFiles.length);
    setResult(null);

    if (selectedFiles.length === 0) {
      setPhotoState({ status: 'idle', message: '', photos: [] });
      return;
    }

    setPhotoState({ status: 'optimizing', message: OPTIMIZATION_MESSAGES.optimizing, photos: [] });
    const optimized = await optimizePhotoSelection(selectedFiles);

    if (selectionId.current !== currentSelectionId) return;

    if (optimized.ok === false) {
      setPhotoState({ status: 'error', message: optimized.error, photos: [] });
      return;
    }

    setPhotoState({ status: 'ready', message: optimized.message, photos: optimized.photos });
  }

  async function submit(details: FormData) {
    if (activeRequest.current || clarifying) return;

    if (photoState.status === 'optimizing') {
      setResult(failedResult('Please wait until photos finish optimizing.', 'photos_optimizing'));
      return;
    }

    if (photoState.status === 'error') {
      setResult(failedResult(photoState.message, 'photo_optimization_failed'));
      return;
    }

    if (photoState.status !== 'ready' || photoState.photos.length === 0) {
      setResult(failedResult('Upload at least one photo.', 'missing_photos'));
      return;
    }

    const processedFiles = photoState.photos.map((photo) => photo.file);
    const sizeRejection = getPhotoSizeRejection(processedFiles);
    if (sizeRejection) {
      setResult(failedResult(sizeRejection, 'request_too_large'));
      return;
    }

    const formData = buildAnalyzeFormWithOptimizedPhotos(details, processedFiles);
    originalForm.current = formData;
    await runAnalysis(formData, false);
  }

  async function runAnalysis(formData: FormData, reassessing: boolean) {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const id = ++requestId.current;
    setLoading(true);
    setClarificationError('');
    if (!reassessing) { setResult(null); setAnswers({}); }
    else setResult((previous) => previous ? { ...previous, pricing: null, priceWithheld: true } : null);
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          accept: 'application/json'
        }
      });

      const data = await readAnalyzeResponse(res);
      if (requestId.current !== id) return;
      if (reassessing && (data.error || data.status === 'analysis_failed')) {
        setClarificationError(data.error || 'Reassessment failed. Your answers are retained; please retry.');
      } else {
        setResult(data); setAnswers({});
        setQuestionsOpen(!data.clarification?.optional);
      }
    } catch {
      if (requestId.current !== id) return;
      if (reassessing) setClarificationError('Reassessment could not finish. Your answers are retained; retry or request manual review.');
      else setResult(failedResult('The estimate request could not be completed. Manual review is required.', 'network_error'));
    } finally {
      clearTimeout(timer);
      if (requestId.current === id) { activeRequest.current = null; setLoading(false); }
    }
  }

  async function submitClarification(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (activeRequest.current || !originalForm.current || !result?.clarification) return;
    const form = new FormData();
    for (const [key, value] of originalForm.current.entries()) form.append(key, value);
    form.set('clarification', JSON.stringify({ token: result.clarification.token, history: result.clarification.history,
      answers: result.clarification.questions.map(({ id }) => ({ id,
        notSure: answers[id]?.notSure ?? false, answer: answers[id]?.notSure ? '' : answers[id]?.answer ?? '' })) }));
    await runAnalysis(form, true);
  }

  function cancelAnalysis() {
    requestId.current += 1;
    activeRequest.current?.abort(); activeRequest.current = null;
    setLoading(false);
  }

  function startOver() {
    cancelAnalysis(); selectionId.current += 1;
    originalForm.current = null; setResult(null); setAnswers({}); setClarificationError(''); setQuestionsOpen(true);
    setFileCount(0); setPhotoState({ status: 'idle', message: '', photos: [] });
    setFormVersion((version) => version + 1);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <main className="page">
      <header className="brandHeader">
        <h1><button type="button" className="brandHome" onClick={startOver} aria-label="Wade Home Services - start over">
          <img src="/winston-logo.png" alt="Wade Home Services logo" width="64" height="64" /><span>Wade Home Services<small>Internal team estimator</small></span>
        </button></h1>
        <span className="staffLabel">Team estimator</span>
      </header>
      <div hidden={loading || canDisplayEstimate(result) || clarifying || result?.status === 'needs_manager_review'}>
        <GuidedJobForm key={formVersion} disabled={loading} photoStatus={photoState.status} photoMessage={photoState.message} photoCount={fileCount}
          onPhotos={(files) => void handlePhotoChange(files)} onAnalyze={submit} />
      </div>

      {loading && <div ref={busyRegion} tabIndex={-1} className="analysisBusy" role="status" aria-live="polite">
        <span className="busyIndicator" aria-hidden="true" />
        <p>{clarifying ? 'Reassessing your job...' : 'Analyzing your job...'}</p>
        <p className="helperText">Reviewing photos, scope and pricing rules. We&apos;re working on your estimate.</p>
        <button type="button" onClick={cancelAnalysis}>Cancel request</button>
      </div>}

      {canDisplayEstimate(result) && <section ref={resultRegion} tabIndex={-1} className="result" aria-label="Internal estimate">
        <div className="quoteBox">
          <p>{result.estimateLabel}</p>
          <h2>{result.pricing.recommendedRange}</h2>
        </div>
        <details open><summary>Review status</summary><p>{formatStatus(result.status)}</p>
        <p><b>Job types:</b> {(result.inputs?.jobTypes ?? [result.inputs?.jobType]).filter(Boolean).join(', ')}</p>
        {result.inputs?.location && <p><b>Location:</b> {result.inputs.location.label}<br />
          <b>{result.inputs.distanceTierSource === 'staff_confirmed' ? 'Staff-confirmed distance tier' : 'Verified city-route distance tier'}:</b> {DISTANCES.find(([tier]) => tier === result.inputs.distanceTier)?.[1]}
          {result.inputs.distanceTierSource === 'staff_confirmed' && ' - this estimate only; no verified city mileage.'}</p>}
        <ul>{result.statusReasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>
        {result.loadUnits && <details aria-label="Model-estimated loaded volume"><summary>Model-estimated loads</summary>
          <p><b>Model-estimated loaded volume:</b> {result.loadUnits.percent}% = {result.loadUnits.cubicYards} cubic yards = {result.loadUnits.trailerEquivalents} trailer equivalents ({result.loadUnits.trailerCubicYards}-yard trailer).</p>
          <p>Whole volume-only hauling trips: {result.loadUnits.volumeOnlyTrips}. Not payload or towing approval.</p>
        </details>}
        <details><summary>Assumptions</summary>
        <ul>{result.assumptions?.map((value) => <li key={value}>{value}</li>)}</ul>
        </details>
        <details><summary>Scope and price drivers</summary>
        {result.priceDrivers?.map((driver, index) => <div key={`${driver.topic}-${index}`}>
          <p><b>{driver.topic} ({driver.state}):</b> {driver.message}</p>
          <ul>{driver.evidence.map((value) => <li key={value}>{value}</li>)}</ul>
        </div>)}
        </details>
      </section>}

      {result?.clarification && <section className="clarificationPanel" aria-labelledby="clarification-title">
        <h2 id="clarification-title">A few details will help refine your estimate</h2>
        {!questionsOpen && <button type="button" disabled={loading} onClick={() => setQuestionsOpen(true)}>Refine estimate</button>}
        {questionsOpen && <>
        <p>Confirm what you can. Unknown answers remain assumptions for staff review.</p>
        <form onSubmit={submitClarification}>
          <fieldset className="jobFields" disabled={loading}>
            {result.clarification.questions.map(({ id, text }) => <div className="clarificationQuestion" key={id}>
              <label htmlFor={`answer-${id}`}>{text}</label>
              <textarea id={`answer-${id}`} maxLength={400} required={!answers[id]?.notSure}
                disabled={answers[id]?.notSure} value={answers[id]?.answer ?? ''}
                onChange={(event) => setAnswers((previous) => ({ ...previous, [id]: { answer: event.target.value, notSure: previous[id]?.notSure ?? false } }))} />
              <label className="notSure"><input type="checkbox" checked={answers[id]?.notSure ?? false}
                onChange={(event) => setAnswers((previous) => ({ ...previous, [id]: { answer: previous[id]?.answer ?? '', notSure: event.target.checked } }))} />Not sure</label>
            </div>)}
            <button type="submit" aria-busy={loading}>Reassess estimate</button>
            {result.clarification.canSkip && canDisplayEstimate(result) && <button type="button" className="restartAnalysis"
              onClick={() => setQuestionsOpen(false)}>Not sure / Show provisional estimate</button>}
            {result.clarification.canSkip && canDisplayEstimate(result) && <p>Skipping keeps the current estimate; unsent answers are not applied.</p>}
          </fieldset>
        </form>
        </>}
        {clarificationError && <p role="alert">{clarificationError}</p>}
      </section>}

      {result && <button type="button" disabled={loading} className="restartAnalysis" onClick={() => {
        setResult(null); setAnswers({}); setClarificationError(''); setQuestionsOpen(true); originalForm.current = null;
      }}>Edit original details</button>}

      {withheld && result?.analysisConfidence && <details aria-label="Analysis-confidence score"><summary>Uncalibrated analysis score</summary>
        <p><b>{ANALYSIS_CONFIDENCE_LABEL}:</b> {result.analysisConfidence.score}/100</p>
        <p>{ANALYSIS_CONFIDENCE_NOTE}</p>
      </details>}

      {result?.status === 'needs_manager_review' && !canDisplayEstimate(result) && <section ref={resultRegion} tabIndex={-1} className="clarificationPanel" role="status">
        <h2>Manager review required</h2>
        <ul>{result.statusReasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </section>}

      {result?.error && (
        <section ref={resultRegion} tabIndex={-1} className="error" role="alert">
          <h3>Analysis Not Available</h3>
          <p>{result.error}</p>
          {result.statusReasons?.length ? <ul>{result.statusReasons.map((x: string) => <li key={x}>{x}</li>)}</ul> : null}
        </section>
      )}

      {result?.diagnostics && <details><summary>Technical shadow diagnostics</summary><ShadowDiagnostics result={result.diagnostics} /></details>}

      {canDisplayEstimate(result) && (
        <section className="result">
          <details><summary>Historical reference</summary><HistoricalReference stairs={result.inputs?.stairs} projectedLoads={result.analysis.estimatedLoadCount} /></details>

          <details><summary>Uncalibrated analysis score</summary>
            <p><b>Status:</b> {formatStatus(result.status)}</p>
            <p><b>{ANALYSIS_CONFIDENCE_LABEL}:</b> {result.analysis.confidencePercent}/100</p>
            <p>{ANALYSIS_CONFIDENCE_NOTE}</p>
            <p><b>Direct-quote workflow threshold:</b> {result.confidenceThreshold}/100</p>
            <p><b>Photo angle quality:</b> {result.analysis.photoAngleQuality}</p>
            {result.statusReasons?.length ? <ul>{result.statusReasons.map((x: string) => <li key={x}>{x}</li>)}</ul> : null}
          </details>

          <details><summary>Core analysis and pricing calculation</summary>
          <div className="grid resultGrid">
            <div>
              <h3>AI Photo Estimate</h3>
              <p><b>Material:</b> {result.analysis.materialType}</p>
              <p><b>Model labor flag (not a surcharge):</b> {result.analysis.difficulty}</p>
              <p><b>Model material/disposal risk (not handling):</b> {result.analysis.heavyDebrisRisk}</p>
            </div>

            <div>
              <h3>Pricing Logic</h3>
              <p><b>Minimum:</b> ${result.pricing.minimumPrice}</p>
              <p><b>Base load price:</b> ${result.pricing.baseLoadPrice}</p>
              <p><b>Adjustments:</b> ${result.pricing.adjustments}</p>
              <ul>{result.pricing.adjustmentNotes.map((x: string) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>

          <h3>Visible Items</h3>
          <ul>{result.analysis.visibleItems?.map((x: string) => <li key={x}>{x}</li>)}</ul>

          <h3>Observed Facts</h3>
          <ul>{result.analysis.observedFacts?.map((x: string) => <li key={x}>{x}</li>)}</ul>

          </details>
          {result.firmQuoteEligible && result.pricing.customerMessage && <>
            <h3>Internal customer-quote draft</h3>
            <textarea readOnly value={result.pricing.customerMessage} />
          </>}
        </section>
      )}
      {result && <button type="button" className="restartAnalysis startOver" onClick={startOver}>Start Over</button>}
    </main>
  );
}

function formatStatus(status?: string) {
  if (!status) return 'Unknown';
  return status.replaceAll('_', ' ');
}
