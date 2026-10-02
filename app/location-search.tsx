'use client';

import { useEffect, useRef, useState } from 'react';
import { isResolvedLocation, isLocationSuggestion, type LocationSuggestion, type ResolvedLocation } from './lib/location-resolution';

export function LocationSearch({ query, selected, staffConfirmed = false, onChange }: {
  query: string; selected: ResolvedLocation | null; staffConfirmed?: boolean; onChange(query: string, location: ResolvedLocation | null): void;
}) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const routeController = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('Search a Southern California city and county. No distance is inferred from the name.');
  useEffect(() => {
    const request = ++sequence.current;
    routeController.current?.abort();
    setBusy(false); setFailed(false);
    setSuggestions([]);
    if (selected) { setStatus(staffConfirmed ? 'Staff-confirmed distance tier selected for this estimate. The city route remains unverified.' : `${selected.representativeDrivingMiles !== null ? `Approximate representative route: ${selected.representativeDrivingMiles.toFixed(1)} driving miles. ` : ''}${selected.reason}`); return; }
    if (query.trim().length < 2) { setStatus('Enter at least two characters to search California locations.'); return; }
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setStatus('Searching the local city directory...');
      setBusy(true);
      try {
        const response = await fetch(`/api/estimate-location?query=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: 'no-store', credentials: 'include' });
        const data = await response.json();
        if (!active || request !== sequence.current) return;
        if (!response.ok) { setStatus(data.error || 'Location search is unavailable. Retry later.'); setFailed(true); return; }
        const matches = Array.isArray(data.suggestions) ? data.suggestions.filter(isLocationSuggestion).slice(0, 20) : [];
        setSuggestions(matches); setStatus(matches.length ? 'Select the city and county. Search coverage does not guarantee a verified distance tier.' : 'No matching city or neighborhood in this directory. Try another name or ask staff; no tier has been assumed.');
      } catch { if (active && request === sequence.current) { setStatus('Location search could not finish. Retry later; no distance tier has been assumed.'); setFailed(true); } }
      finally { if (active && request === sequence.current) setBusy(false); }
    }, 300);
    return () => { active = false; ++sequence.current; clearTimeout(timer); controller.abort(); routeController.current?.abort(); };
  }, [query, selected, staffConfirmed, retry]);
  async function select(location: LocationSuggestion) {
    routeController.current?.abort();
    const controller = new AbortController(); routeController.current = controller;
    const request = ++sequence.current;
    setBusy(true); setFailed(false); setSuggestions([]); setStatus('Checking the curated route record...');
    try {
      const response = await fetch(`/api/estimate-location?cityId=${encodeURIComponent(location.id)}`, { signal: controller.signal, cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      if (request !== sequence.current) return;
      if (!response.ok || !isResolvedLocation(data.location)) { setStatus(data.error || 'City selection could not be verified. Retry the search.'); setFailed(true); return; }
      onChange(data.location.label, data.location);
    } catch { if (request === sequence.current) { setStatus('City lookup could not finish. Retry the location search. No tier was assumed.'); setFailed(true); } }
    finally { if (request === sequence.current) setBusy(false); }
  }
  return <div>
    <label className="fieldLabel" htmlFor="location-search">Southern California city or neighborhood</label>
    <input id="location-search" type="search" autoComplete="off" maxLength={160} value={query} aria-describedby="location-status"
      onChange={(event) => { ++sequence.current; routeController.current?.abort(); onChange(event.target.value, null); }} />
    <p id="location-status" role="status" aria-busy={busy} className="helperText">{status}</p>
    {failed && <button type="button" className="secondary" onClick={() => setRetry((value) => value + 1)}>Retry location search</button>}
    {suggestions.length > 0 && <ul className="locationSuggestions" aria-label="California location suggestions">{suggestions.map((location) => <li key={location.id}>
      <button type="button" disabled={busy} onClick={() => void select(location)}>{location.label}</button>
    </li>)}</ul>}
    <p className="helperText">City names: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (CC BY 4.0). City-level distances, when verified, are approximate and are not exact customer-address mileage.</p>
  </div>;
}
