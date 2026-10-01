import { NextResponse } from 'next/server';
import { LocationError, resolveLocation, searchLocations } from '../../lib/location-provider';
export const runtime = 'nodejs';

// Existing protected-route proxy covers both autocomplete and route resolution.
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const params = new URL(request.url).searchParams;
  const query = params.get('query')?.trim();
  const id = params.get('placeId');
  const session = params.get('session') ?? '';
  if (!/^[a-zA-Z0-9_-]{16,36}$/.test(session) || (id ? !/^[A-Za-z0-9_-]{1,200}$/.test(id) || !!query : !query || query.length < 2 || query.length > 80)) {
    return NextResponse.json({ error: 'Enter a city or neighborhood and select a search result.' }, { status: 400, headers });
  }
  try {
    return NextResponse.json(id ? { location: await resolveLocation(id, session) } : { suggestions: await searchLocations(query!, session) }, { headers });
  } catch (error) {
    return NextResponse.json({ status: 'blocked', error: error instanceof LocationError ? error.message : 'Location search is temporarily unavailable. No tier was assumed.', suggestions: [] },
      { status: error instanceof LocationError ? error.status : 502, headers });
  }
}
