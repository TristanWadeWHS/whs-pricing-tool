import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { priceJob } from '../../lib/pricing';
import { validateEstimateForm } from '../../lib/request-validation';
import { AnalysisError, analyzeJobPhotosWithOpenAI } from '../../lib/openai-analysis';
import { buildCustomerMessage, determineQuoteStatus } from '../../lib/quote-status';

export const runtime = 'nodejs';

function fileToBase64(bytes: Uint8Array, mime: string) {
  const base64 = Buffer.from(bytes).toString('base64');
  return `data:${mime};base64,${base64}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return analysisFailed('OpenAI is not configured. Manual review is required.', 'missing_openai_api_key');
    }

    const form = await req.formData();
    const validation = await validateEstimateForm(form);
    if (validation.ok === false) {
      return NextResponse.json({ status: 'analysis_failed', error: validation.error }, { status: validation.status });
    }

    const { inputs, photos } = validation.value;
    const imageParts = photos.map((photo) => ({
      type: 'input_image' as const,
      image_url: fileToBase64(photo.bytes, photo.mime),
      detail: 'high' as const
    }));

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const analysis = await analyzeJobPhotosWithOpenAI(client, inputs, imageParts);
    const quoteStatus = determineQuoteStatus(inputs, analysis);
    const pricing = priceJob(inputs, analysis);
    const customerMessage = buildCustomerMessage(pricing, quoteStatus.status);

    return NextResponse.json({
      status: quoteStatus.status,
      statusReasons: quoteStatus.reasons,
      confidenceThreshold: quoteStatus.threshold,
      analysis,
      pricing: { ...pricing, customerMessage },
      inputs
    });
  } catch (err: unknown) {
    const code = err instanceof AnalysisError ? err.code : 'analysis_error';
    return analysisFailed('AI analysis could not be completed. Manual review is required.', code);
  }
}

function analysisFailed(message: string, code: string) {
  return NextResponse.json(
    {
      status: 'analysis_failed',
      error: message,
      errorCode: code,
      analysis: null,
      pricing: null,
      statusReasons: ['AI photo analysis could not be completed. Manual review is required.']
    },
    { status: 502 }
  );
}
