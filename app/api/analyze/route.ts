import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { priceJob } from '../../lib/pricing';
import { validateEstimateForm } from '../../lib/request-validation';
import { AnalysisError, analyzeJobPhotosWithOpenAI } from '../../lib/openai-analysis';
import { buildCustomerMessage, determineQuoteStatus } from '../../lib/quote-status';
import { clarificationQuestions, hasUnresolvedAnswers, issueClarification, MAX_CLARIFICATION_ROUNDS, QUESTION_TEXT, verifyClarificationRound } from '../../lib/clarification';
import { analysisConfidence } from '../../lib/analysis-confidence';
import { safeShadowDiagnostics } from '../../lib/shadow-diagnostics';
import { shadowPreviewEnabled } from '../../lib/shadow-schema';
import { assessInternalEstimate, INTERNAL_ESTIMATE_LABEL } from '../../lib/internal-estimate';
import { normalizeClarificationAnswer } from '../../lib/clarification-facts';

export const runtime = 'nodejs';

function fileToBase64(bytes: Uint8Array, mime: string) {
  const base64 = Buffer.from(bytes).toString('base64');
  return `data:${mime};base64,${base64}`;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    console.info('[analyze] request received', { requestId });

    const form = await req.formData();
    const validation = await validateEstimateForm(form);
    if (validation.ok === false) {
      console.warn('[analyze] request validation failed', {
        requestId,
        status: validation.status,
        errorCode: 'invalid_request'
      });
      return NextResponse.json({ status: 'analysis_failed', error: validation.error }, { status: validation.status });
    }

    const { inputs, photos } = validation.value;
    let round: ReturnType<typeof verifyClarificationRound>;
    try {
      if (form.getAll('clarification').length > 1) throw new Error('Duplicate clarification.');
      round = verifyClarificationRound(form.get('clarification'), validation.value);
    } catch {
      return NextResponse.json({ status: 'analysis_failed', analysis: null, pricing: null,
        error: 'Clarification is invalid, expired, or does not match the original job. Restart analysis to continue.',
        errorCode: 'invalid_clarification' }, { status: 400 });
    }
    const answers = round?.answers ?? [];
    const decodedImageBytes = photos.reduce((total, photo) => total + photo.bytes.byteLength, 0);
    console.info('[analyze] request validation passed', {
      requestId,
      imageCount: photos.length,
      decodedImageBytes
    });

    if (!process.env.OPENAI_API_KEY) {
      console.warn('[analyze] missing OpenAI configuration', { requestId });
      return analysisFailed('OpenAI is not configured. Manual review is required.', 'missing_openai_api_key');
    }

    const imageParts = photos.map((photo) => ({
      type: 'input_image' as const,
      image_url: fileToBase64(photo.bytes, photo.mime),
      detail: 'high' as const
    }));

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.info('[analyze] OpenAI analysis started', { requestId });
    const analysis = await analyzeJobPhotosWithOpenAI(client, inputs, imageParts, { clarifications: round ? answers.map(normalizeClarificationAnswer) : undefined });
    console.info('[analyze] OpenAI analysis completed', {
      requestId,
      confidencePercent: analysis.confidencePercent,
      estimatedLoadPercent: analysis.estimatedLoadPercent
    });

    const diagnostics = shadowPreviewEnabled() ? safeShadowDiagnostics(inputs, analysis, answers, photos.length) : undefined;
    const assessment = assessInternalEstimate(inputs, analysis, answers, photos.length);
    const pendingQuestions = clarificationQuestions({ ...analysis,
      questionsToAsk: [...assessment.essentialQuestions.map((id) => QUESTION_TEXT[id]), ...analysis.questionsToAsk]
    }, inputs.notes, answers, photos.length);
    const questions = (round?.round ?? 0) < MAX_CLARIFICATION_ROUNDS ? pendingQuestions : [];
    const clarification = questions.length ? { questions, history: answers, round: (round?.round ?? 0) + 1,
      optional: Boolean(round), canSkip: assessment.essentialReasons.length === 0,
      token: issueClarification(validation.value, questions, Date.now(), { history: answers,
        round: (round?.round ?? 0) + 1, expires: round?.expires }) } : null;
    if (assessment.essentialReasons.length) {
      return NextResponse.json({ status: 'needs_manager_review', estimateKind: 'withheld', firmQuoteEligible: false,
        analysis: null, pricing: null, inputs: null, priceWithheld: true,
        analysisConfidence: analysisConfidence(analysis.confidencePercent),
        statusReasons: assessment.essentialReasons, diagnostics, clarification
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const quoteStatus = determineQuoteStatus(inputs, analysis);
    const evidenceReview = assessment.pricingFacts.reviewReasons.filter((reason) => !reason.startsWith('Handling requirements are unverified'));
    if (evidenceReview.length) {
      quoteStatus.status = 'needs_manager_review';
      quoteStatus.reasons.push(...evidenceReview);
    }
    if (hasUnresolvedAnswers(answers) || assessment.facts.some((fact) => fact.state === 'conflicting'
      || (fact.source === 'signed_clarification' && fact.state === 'unknown'))) {
      quoteStatus.status = 'needs_manager_review';
      quoteStatus.reasons = [...quoteStatus.reasons.filter((reason) => !reason.startsWith('Meets provisional')),
        'Clarification includes an unknown or conflicting answer. Manager review is required before a firm quote.'];
    }
    if (quoteStatus.status === 'direct_quote_eligible' && (analysis.confidencePercent < 85 || pendingQuestions.length)) {
      quoteStatus.status = 'conditional_estimate';
    }
    const firmQuoteEligible = quoteStatus.status === 'direct_quote_eligible';
    const pricing = priceJob(inputs, analysis, assessment.pricingFacts);
    const customerMessage = firmQuoteEligible ? buildCustomerMessage(pricing, quoteStatus.status) : null;

    return NextResponse.json({
      status: quoteStatus.status,
      statusReasons: firmQuoteEligible ? ['Existing firm-quote eligibility checks passed; staff approval is still required.']
        : ['Staff review is required before quoting.', ...quoteStatus.reasons.filter((reason) => !reason.startsWith('Meets provisional'))
          .map((reason) => assessment.pricingFacts.hidden.state === 'resolved' && /Hidden-debris uncertainty|Analysis warnings may materially/.test(reason)
            ? 'Removal scope is answered; staff must verify the retained model review flag. No hidden-scope surcharge applies.'
            : `Retained firm-quote safeguard: ${reason.replace('Confidence is', 'Uncalibrated analysis-confidence score is')}`)],
      estimateKind: firmQuoteEligible ? 'quote_candidate' : 'provisional', firmQuoteEligible,
      estimateLabel: INTERNAL_ESTIMATE_LABEL, assumptions: assessment.assumptions, priceDrivers: assessment.drivers, clarification,
      loadUnits: assessment.pricingFacts.load,
      confidenceThreshold: quoteStatus.threshold,
      analysisConfidence: analysisConfidence(analysis.confidencePercent),
      priceWithheld: false,
      analysis: Object.fromEntries(Object.entries(analysis).filter(([key]) => key !== 'shadow')),
      diagnostics,
      pricing: { ...pricing, customerMessage },
      inputs
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const code = err instanceof AnalysisError ? err.code : 'analysis_error';
    console.error('[analyze] request failed', {
      requestId,
      errorCode: code,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      durationMs: Date.now() - startedAt
    });
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
