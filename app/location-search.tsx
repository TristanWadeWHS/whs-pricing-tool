'use client';

import { useEffect, useState } from 'react';
import { isResolvedLocation, LOCATION_BLOCKER, type ResolvedLocation } from './lib/location-resolution';

export function LocationSearch({ query, selected, onChange }: {
  query: string; selected: ResolvedLocation | null; onChange(query: string, location: ResolvedLocation | null): void;
}) {
  const [suggestions, setSuggestions] = useState<ResolvedLocation[]>([]);
  const [status, setStatus] = useState('Search a California city or neighborhood. No distance is inferred from the name.');
  useEffect(() => {
    setSuggestions([]);
    if (selected) { setStatus('Location selected. Distance tier is based on the returned driving route, not exact miles to the job.'); return; }
    if (query.trim().length < 2) { setStatus('Enter at least two characters to search California locations.'); return; }
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setStatus('Searching California locations...');
      try {
        const response = await fetch(`/api/estimate-location?query=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: 'no-store', credentials: 'include' });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) { setStatus(LOCATION_BLOCKER); return; }
        const matches = Array.isArray(data.suggestions) ? data.suggestions.filter(isResolvedLocation).slice(0, 8) : [];
        setSuggestions(matches); setStatus(matches.length ? 'Select a location below.' : 'No supported California route found. No tier has been assumed.');
      } catch { if (active) setStatus('Location search could not finish. Retry later; no distance tier has been assumed.'); }
    }, 300);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, selected]);
  return <div>
    <label className="fieldLabel" htmlFor="location-search">California city or neighborhood</label>
    <input id="location-search" type="search" autoComplete="off" maxLength={80} value={query} aria-describedby="location-status"
      onChange={(event) => onChange(event.target.value, null)} />
    <p id="location-status" role="status" className="helperText">{status}</p>
    {suggestions.length > 0 && <ul className="locationSuggestions" aria-label="California location suggestions">{suggestions.map((location) => <li key={location.id}>
      <button type="button" onClick={() => { setSuggestions([]); onChange(location.label, location); }}>{location.label}</button>
    </li>)}</ul>}
  </div>;
}
