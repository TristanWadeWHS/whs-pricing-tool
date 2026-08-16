'use client';

import { useState } from 'react';

type Result = {
  status?: 'analysis_failed' | 'needs_manager_review' | 'conditional_estimate' | 'direct_quote_eligible';
  statusReasons?: string[];
  confidenceThreshold?: number;
  analysis: any;
  pricing: any;
  inputs: any;
  error?: string;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fileCount, setFileCount] = useState(0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        status: 'analysis_failed',
        error: 'The estimate request could not be completed. Manual review is required.',
        analysis: null,
        pricing: null,
        inputs: null
      });
    } finally {
      setLoading(false);
    }
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
        <label>
          Job photos, 1-5 images
          <input
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            required
            onChange={(e) => setFileCount(e.target.files?.length || 0)}
          />
          <span className="helperText">{fileCount > 0 ? `${fileCount} image(s) selected` : 'Select up to 5 photos from different angles.'}</span>
        </label>

        <div className="grid">
          <label>
            Distance tier
            <select name="distanceTier" defaultValue="under25">
              <option value="under25">Within 25 miles - $130 minimum</option>
              <option value="25to40">25-40 miles - $145 minimum</option>
              <option value="40to65">40-65 miles - $175 minimum</option>
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

        <button disabled={loading}>{loading ? 'Analyzing...' : 'Analyze Job'}</button>
      </form>

      {result?.error && (
        <section className="card error">
          <h3>Analysis Not Available</h3>
          <p>{result.error}</p>
          {result.statusReasons?.length ? <ul>{result.statusReasons.map((x: string) => <li key={x}>{x}</li>)}</ul> : null}
        </section>
      )}

      {result?.analysis && result?.pricing && (
        <section className="card result">
          <div className="quoteBox">
            <p>{result.status === 'direct_quote_eligible' ? 'Suggested Quote' : 'Internal Estimate'}</p>
            <h2>${result.pricing.suggestedQuote}</h2>
            <span>{result.pricing.recommendedRange}</span>
          </div>

          <div className="summaryBox">
            <h3>Estimate Quality</h3>
            <p><b>Status:</b> {formatStatus(result.status)}</p>
            <p><b>Confidence:</b> {result.analysis.confidencePercent}%</p>
            <p><b>Direct-quote threshold:</b> {result.confidenceThreshold}% provisional</p>
            <p><b>Photo angle quality:</b> {result.analysis.photoAngleQuality}</p>
            <p><b>Potential hidden debris risk:</b> {result.analysis.hiddenDebrisRisk}</p>
            {result.statusReasons?.length ? <ul>{result.statusReasons.map((x: string) => <li key={x}>{x}</li>)}</ul> : null}
          </div>

          <div className="competitorBox">
            <h3>Competitor Pricing Summary</h3>
            <p>{result.pricing.competitorSummary}</p>
          </div>

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

          <h3>Assumptions and Uncertainty</h3>
          <ul>{result.analysis.assumptions?.map((x: string) => <li key={x}>{x}</li>)}</ul>
          <ul>{result.analysis.uncertaintyNotes?.map((x: string) => <li key={x}>{x}</li>)}</ul>

          <h3>Warnings</h3>
          <ul>{result.analysis.warnings?.map((x: string) => <li key={x}>{x}</li>)}</ul>

          <h3>Questions to Ask Client</h3>
          <ul>{result.analysis.questionsToAsk?.map((x: string) => <li key={x}>{x}</li>)}</ul>

          <h3>{result.status === 'direct_quote_eligible' ? 'Copy/Paste Customer Message' : 'Review Message'}</h3>
          <textarea readOnly value={result.pricing.customerMessage} />
        </section>
      )}
    </main>
  );
}

function formatStatus(status?: string) {
  if (!status) return 'Unknown';
  return status.replaceAll('_', ' ');
}
