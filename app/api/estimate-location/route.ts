import { NextResponse } from 'next/server';
import { resolveCity, searchCities } from '../../lib/city-directory';
export const runtime = 'nodejs';

// Existing auth proxy; source-controlled data only, no credentials or external fetch.
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const params = new URL(request.url).searchParams;
  const query = params.get('query')?.trim(), id = params.get('cityId');
  if (id) {
    const city = !query && /^geonames:\d+$/.test(id) ? resolveCity(id) : null;
    return NextResponse.json(city ? { location: city } : { error: 'Select a city from the local directory.' }, { status: city ? 200 : 400, headers });
  }
  if (!query || query.length < 2 || query.length > 80) return NextResponse.json({ error: 'Enter at least two characters of a city or county.' }, { status: 400, headers });
  return NextResponse.json({ suggestions: searchCities(query) }, { headers });
}
