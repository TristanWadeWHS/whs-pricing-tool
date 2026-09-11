'use client';

import { useEffect, useState } from 'react';
import { abstain, type HistoricalReferenceResult } from './lib/historical-reference';

export function HistoricalReference({ stairs }: { stairs: 'none' | 'some' | 'heavy' }) {
  const [result, setResult] = useState<HistoricalReferenceResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 8000);
    setResult(null);
    fetch('/api/historical-reference', { method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stairs }), signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (!['matched', 'abstained', 'unavailable'].includes(data.status) || !Array.isArray(data.reasons)
          || !data.reasons.every((reason) => typeof reason === 'string')) throw new Error('invalid');
        if (data.status === 'matched' && (!Number.isInteger(data.matchedCount) || data.matchedCount < 5
          || ![data.median, data.p25, data.p75].every((value) => typeof value === 'number' && Number.isFinite(value))
          || data.p25 > data.median || data.median > data.p75)) throw new Error('invalid');
        if (active) setResult(data);
      })
      .catch(() => { if (active) setResult(abstain('Historical data is unavailable. The calculated estimate is unchanged.', 'unavailable')); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [stairs]);
  const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return <section className="historicalReference" aria-label="Historical reference" aria-live="polite">
    <h3>Historical reference <small>Internal advisory</small></h3>
    {!result ? <p>Checking historical scope...</p> : <>
      {result.status === 'matched' ? <dl className="historicalStats">
        <div><dt>Matched priced jobs</dt><dd>{result.matchedCount}</dd></div>
        <div><dt>Median completed price</dt><dd>{money(result.median)}</dd></div>
        <div><dt>Middle 50%</dt><dd>{money(result.p25)} to {money(result.p75)}</dd></div>
      </dl> : <p><strong>{result.status === 'abstained' ? 'No reliable comparison available' : 'Historical reference unavailable'}</strong></p>}
      {result.reasons.map((reason, index) => <p key={index}>{reason}</p>)}
    </>}
    <p className="historicalCaveat">Historical figures are completed prices and may include added scope. Before-quote timing is unverified. Descriptive references only, not confidence intervals or validated predictions. The calculated estimate and quote safeguards are unchanged.</p>
  </section>;
}
