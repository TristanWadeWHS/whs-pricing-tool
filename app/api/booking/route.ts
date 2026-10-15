import { NextResponse } from 'next/server';

// Phase 1 captures inquiries only. Retire promotion and legacy booking writes;
// the verified website handoff needs a separate, approved implementation.
export async function POST(_req:Request) {
  return NextResponse.json({ error: 'Promotional offers and booking submission are unavailable. No appointment was requested or notification sent.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
