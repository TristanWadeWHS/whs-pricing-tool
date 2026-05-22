'use client';

import { useState } from 'react';

type Result = {
  analysis: any;
  pricing: any;
  inputs: any;
  error?: string;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const formData = new FormData(e.currentTarget);

    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Wade Home Services</p>
        <h1>Internal Pricing Tool</h1>
        <p className="sub">Upload job photos, enter the basic details, and get an AI-assisted quote recommendation.</p>
      </section>

      <form className="card form" onSubmit={submit}>
        <label>
          Job photos, 1–5 images
          <input name="photos" type="file" accept="image/*" multiple required />
        </label>

        <div className="grid">
          <label>
            Distance tier
            <select name="distanceTier" defaultValue="under25">
              <option value="under25">Within 25 miles — $130 minimum</option>
              <option value="25to40">25–40 miles — $145 minimum</option>
              <option value="40to65">40–65 miles — $175 minimum</option>
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
          <textarea name="notes" placeholder="Example: client says mostly cardboard, garage access, no stairs, possible items in backyard..." />
        </label>

        <button disabled={loading}>{loading ? 'Analyzing...' : 'Analyze Job'}</button>
      </form>

      {result?.error && <section className="card error">{result.error}</section>}

      {result?.analysis && result?.pricing && (
        <section className="card result">
          <div className="quoteBox">
            <p>Suggested Quote</p>
            <h2>${result.pricing.suggestedQuote}</h2>
            <span>{result.pricing.recommendedRange}</span>
          </div>

          <div className="grid resultGrid">
            <div>
              <h3>AI Photo Estimate</h3>
              <p><b>Load:</b> {result.analysis.estimatedLoadRange} ({result.analysis.estimatedLoadPercent}%)</p>
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

          <h3>Warnings</h3>
          <ul>{result.analysis.warnings?.map((x: string) => <li key={x}>{x}</li>)}</ul>

          <h3>Questions to Ask Client</h3>
          <ul>{result.analysis.questionsToAsk?.map((x: string) => <li key={x}>{x}</li>)}</ul>

          <h3>Copy/Paste Customer Message</h3>
          <textarea readOnly value={result.pricing.customerMessage} />
        </section>
      )}
    </main>
  );
}
