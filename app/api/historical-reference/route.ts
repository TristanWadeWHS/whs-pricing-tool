import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { proxy } from '../../../proxy';
import { currentReferenceScope, resolveHistoricalReference } from '../../lib/historical-reference';

export const runtime = 'nodejs';
const requestSchema = z.object({ stairs: z.enum(['none', 'some', 'heavy']) }).strict();
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest) {
  const authorization = proxy(request);
  if (authorization.status !== 200) return authorization;
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Preview only.' }, { status: 404, headers });
  }
  const reader = request.body?.getReader();
  let text = '';
  let bytes = 0;
  try {
    if (!reader) throw new Error('missing body');
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256) {
        await reader.cancel();
        return NextResponse.json({ error: 'Request too large.' }, { status: 413, headers });
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const input = requestSchema.parse(JSON.parse(text));
    // No Sheet retrieval is warranted until the app/history scope crosswalk exists.
    // This loader deliberately fails closed even if prerequisites change accidentally.
    const result = await resolveHistoricalReference(currentReferenceScope(input.stairs), async () => {
      throw new Error('Verified historical scope source is not configured.');
    });
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ error: 'Invalid scope request.' }, { status: 400, headers });
  } finally { reader?.releaseLock(); }
}
