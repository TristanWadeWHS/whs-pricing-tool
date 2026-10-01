import { NextResponse } from 'next/server';
import { LOCATION_BLOCKER } from '../../lib/location-resolution';

// Covered by the existing protected-route proxy. No provider or customer-data requests.
export async function GET() {
  return NextResponse.json({ status: 'blocked', error: LOCATION_BLOCKER, suggestions: [] },
    { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
