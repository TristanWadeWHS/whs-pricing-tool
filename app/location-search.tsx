'use client';

import { useEffect, useRef, useState } from 'react';
import { isResolvedLocation, isLocationSuggestion, type LocationSuggestion, type ResolvedLocation } from './lib/location-resolution';

export function LocationSearch({ query, selected, onChange }: {
  query: string; selected: ResolvedLocation | null; onChange(query: string, location: ResolvedLocation | null): void;
}) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const session = useRef('');
  const sequence = useRef(0);
  const routeController = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('Search a California city or neighborhood. No distance is inferred from the name.');
  useEffect(() => {
    const request = ++sequence.current;
    routeController.current?.abort();
    if (!session.current) session.current = crypto.randomUUID();
    setBusy(false); setFailed(false);
    setSuggestions([]);
    if (selected) { setStatus(`Approximate city-level driving distance from Rancho Mission Viejo: ${selected.drivingMiles.toFixed(1)} miles. Not the exact distance to the customer address.`); return; }
    if (query.trim().length < 2) { setStatus('Enter at least two characters to search California locations.'); return; }
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setStatus('Searching California locations...');
      setBusy(true);
      try {
        const response = await fetch(`/api/estimate-location?query=${encodeURIComponent(query.trim())}&session=${session.current}`, { signal: controller.signal, cache: 'no-store', credentials: 'include' });
        const data = await response.json();
        if (!active || request !== sequence.current) return;
        if (!response.ok) { setStatus(data.error || 'Location search is unavailable. Retry later.'); setFailed(true); return; }
        const matches = Array.isArray(data.suggestions) ? data.suggestions.filter(isLocationSuggestion).slice(0, 5) : [];
        setSuggestions(matches); setStatus(matches.length ? 'Select a location to calculate its approximate driving route.' : 'No California city or neighborhood found. Try another name. No tier has been assumed.');
      } catch { if (active && request === sequence.current) { setStatus('Location search could not finish. Retry later; no distance tier has been assumed.'); setFailed(true); } }
      finally { if (active && request === sequence.current) setBusy(false); }
    }, 300);
    return () => { active = false; ++sequence.current; clearTimeout(timer); controller.abort(); routeController.current?.abort(); };
  }, [query, selected, retry]);
  async function select(location: LocationSuggestion) {
    routeController.current?.abort();
    const controller = new AbortController(); routeController.current = controller;
    const request = ++sequence.current;
    setBusy(true); setFailed(false); setSuggestions([]); setStatus('Calculating approximate city-level driving route...');
    try {
      const response = await fetch(`/api/estimate-location?placeId=${encodeURIComponent(location.id)}&session=${session.current}`, { signal: controller.signal, cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      if (request !== sequence.current) return;
      session.current = crypto.randomUUID();
      if (!response.ok || !isResolvedLocation(data.location)) { setStatus(data.error || 'No valid driving route returned. Select another location.'); setFailed(true); return; }
      onChange(data.location.label, data.location);
    } catch { if (request === sequence.current) { setStatus('Driving route could not finish. Retry the location search. No tier was assumed.'); setFailed(true); } }
    finally { if (request === sequence.current) setBusy(false); }
  }
  return <div>
    <label className="fieldLabel" htmlFor="location-search">California city or neighborhood</label>
    <input id="location-search" type="search" autoComplete="off" maxLength={80} value={query} aria-describedby="location-status"
      onChange={(event) => { ++sequence.current; routeController.current?.abort(); onChange(event.target.value, null); }} />
    <p id="location-status" role="status" aria-busy={busy} className="helperText">{status}</p>
    {failed && <button type="button" className="secondary" onClick={() => setRetry((value) => value + 1)}>Retry location search</button>}
    {suggestions.length > 0 && <ul className="locationSuggestions" aria-label="California location suggestions">{suggestions.map((location) => <li key={location.id}>
      <button type="button" disabled={busy} onClick={() => void select(location)}>{location.label}</button>
    </li>)}</ul>}
    {(suggestions.length > 0 || selected) && <p className="helperText" translate="no" style={{ color: '#5e5e5e', fontWeight: 400, whiteSpace: 'nowrap' }}>Google Maps</p>}
  </div>;
}
