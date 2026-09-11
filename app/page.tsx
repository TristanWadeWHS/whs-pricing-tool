'use client';

import { useEffect, useRef, useState } from 'react';
import { HistoricalReference } from './historical-reference';
import { ShadowDiagnostics } from './shadow-diagnostics';
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
  const [answers, setAnswers] = useState<Record<string, { answer: string; notSure: boolean }>>({});
  const [clarificationError, setClarificationError] = useState('');
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const clarifying = Boolean(result?.clarification);
  const withheld = Boolean(result?.priceWithheld) || result?.status === 'analysis_failed';

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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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

    const formData = buildAnalyzeFormWithOptimizedPhotos(new FormData(e.currentTarget), processedFiles);
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

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Wade Home Services</p>
          <h1>Internal Pricing Tool</h1>
          <p className="sub">Upload job photos, enter the basic details, and get an AI-assisted quote recommendation.</p>
        </div>
        <img className="winstonLogo" src="/winston-logo.png" alt="Wade Home Services Winston logo" />
      </section>

      <form className="card form" onSubmit={submit}>
        <fieldset className="jobFields" disabled={loading || clarifying}>
        <label>
          Job photos, 1-5 images
          <input
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            required
            aria-describedby="photo-help photo-status"
            onChange={(e) => void handlePhotoChange(e.target.files)}
          />
          <span id="photo-help" className="helperText">{fileCount > 0 ? `${fileCount} image(s) selected` : 'Select up to 5 photos from different angles.'}</span>
          {photoState.message ? (
            <span
              id="photo-status"
              className={photoState.status === 'error' ? 'helperText photoErrorText' : 'helperText'}
              role="status"
              aria-live="polite"
            >
              {photoState.message}
            </span>
          ) : null}
        </label>

        <div className="grid">
          <label>
            Distance tier
            <select name="distanceTier" defaultValue="under25">
              <option value="under25">{withheld ? 'Within 25 miles' : 'Within 25 miles - $130 minimum'}</option>
              <option value="25to40">{withheld ? '25-40 miles' : '25-40 miles - $145 minimum'}</option>
              <option value="40to65">{withheld ? '40-65 miles' : '40-65 miles - $175 minimum'}</option>
            </select>
          </label>

          <label>
            Job type
            <select name="jobType" defaultValue="mixed junk">
              <option value="mixed junk">Mixed junk</option>
              <option value="furniture">Furniture</option>
              <option value="cardboard only">Cardboard only</option>
              <option value="demo debris">Demo debris</option>
              <option value="concrete / dirt / heavy debris">Concrete / dirt / heavy debris</option>
              <option value="appliances">Appliances</option>
              <option value="storage relocation">Storage relocation</option>
            </select>
          </label>

          <label>
            Carry distance
            <select name="carryDistance" defaultValue="short">
              <option value="curbside">Curbside / driveway</option>
              <option value="short">Short carry</option>
              <option value="medium">Medium carry</option>
              <option value="long">Long carry / backyard / difficult access</option>
            </select>
          </label>

          <label>
            Stairs
            <select name="stairs" defaultValue="none">
              <option value="none">No stairs</option>
              <option value="some">Some stairs</option>
              <option value="heavy">Heavy stairs / upstairs furniture</option>
            </select>
          </label>

          <label>
            Workers planned
            <input name="workers" type="number" min="1" max="6" defaultValue="1" />
          </label>
        </div>

        <label>
          Notes from employee
          <textarea name="notes" maxLength={1000} placeholder="Example: client says mostly cardboard, garage access, no stairs, possible items in backyard..." />
        </label>

        <button disabled={loading || photoState.status === 'optimizing' || photoState.status === 'error'} aria-busy={loading || photoState.status === 'optimizing'}>
          {photoState.status === 'optimizing' ? OPTIMIZATION_MESSAGES.optimizing : loading ? 'Analyzing...' : 'Analyze Job'}
        </button>
        </fieldset>
      </form>

      {loading && <div className="analysisBusy" role="status" aria-live="polite">
        <p>{clarifying ? 'Reassessing your job...' : 'Analyzing your job...'}</p>
        <button type="button" onClick={cancelAnalysis}>Cancel request</button>
      </div>}

      {canDisplayEstimate(result) && <section className="result" aria-label="Internal estimate">
        <div className="quoteBox">
          <p>{result.estimateLabel}</p>
          <h2>{result.pricing.recommendedRange}</h2>
        </div>
        <p><b>Review status:</b> {formatStatus(result.status)}</p>
        <ul>{result.statusReasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <h3>Assumptions</h3>
        <ul>{result.assumptions?.map((value) => <li key={value}>{value}</li>)}</ul>
        <h3>Scope and price drivers</h3>
        {result.priceDrivers?.map((driver, index) => <div key={`${driver.topic}-${index}`}>
          <p><b>{driver.topic} ({driver.state}):</b> {driver.message}</p>
          <ul>{driver.evidence.map((value) => <li key={value}>{value}</li>)}</ul>
        </div>)}
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

      {withheld && result?.analysisConfidence && <section aria-label="Analysis-confidence score">
        <p><b>{ANALYSIS_CONFIDENCE_LABEL}:</b> {result.analysisConfidence.score}/100</p>
        <p>{ANALYSIS_CONFIDENCE_NOTE}</p>
      </section>}

      {result?.status === 'needs_manager_review' && !canDisplayEstimate(result) && <section className="clarificationPanel" role="status">
        <h2>Manager review required</h2>
        <ul>{result.statusReasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </section>}

      {result?.error && (
        <section className="card error">
          <h3>Analysis Not Available</h3>
          <p>{result.error}</p>
          {result.statusReasons?.length ? <ul>{result.statusReasons.map((x: string) => <li key={x}>{x}</li>)}</ul> : null}
        </section>
      )}

      {result?.diagnostics && <details><summary>Technical shadow diagnostics</summary><ShadowDiagnostics result={result.diagnostics} /></details>}

      {canDisplayEstimate(result) && (
        <section className="card result">
          <HistoricalReference stairs={result.inputs?.stairs} projectedLoads={result.analysis.estimatedLoadCount} />

          <div className="summaryBox">
            <h3>Estimate Quality</h3>
            <p><b>Status:</b> {formatStatus(result.status)}</p>
            <p><b>{ANALYSIS_CONFIDENCE_LABEL}:</b> {result.analysis.confidencePercent}/100</p>
            <p>{ANALYSIS_CONFIDENCE_NOTE}</p>
            <p><b>Direct-quote workflow threshold:</b> {result.confidenceThreshold}/100</p>
            <p><b>Photo angle quality:</b> {result.analysis.photoAngleQuality}</p>
            {result.statusReasons?.length ? <ul>{result.statusReasons.map((x: string) => <li key={x}>{x}</li>)}</ul> : null}
          </div>

          <details><summary>Core analysis and unchanged pricing calculation</summary>
          <div className="grid resultGrid">
            <div>
              <h3>AI Photo Estimate</h3>
              <p><b>Load:</b> {result.analysis.estimatedLoadRange} ({result.analysis.estimatedLoadPercent}%)</p>
              <p><b>Estimated loads:</b> {result.analysis.estimatedLoadCount}</p>
              <p><b>Material:</b> {result.analysis.materialType}</p>
              <p><b>Difficulty:</b> {result.analysis.difficulty}</p>
              <p><b>Heavy risk:</b> {result.analysis.heavyDebrisRisk}</p>
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
    </main>
  );
}

function formatStatus(status?: string) {
  if (!status) return 'Unknown';
  return status.replaceAll('_', ' ');
}
