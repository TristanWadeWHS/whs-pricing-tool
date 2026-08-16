import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { JobInputs } from './pricing';
import { VisionAnalysis, visionAnalysisSchema } from './analysis-schema';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6';
export const OPENAI_ANALYSIS_TIMEOUT_MS = 45_000;

export class AnalysisError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

export function getConfiguredOpenAIModel() {
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  if (!model.trim()) {
    throw new AnalysisError('OpenAI model is not configured.', 'missing_model');
  }
  return model;
}

export async function analyzeJobPhotosWithOpenAI(
  client: OpenAI,
  inputs: JobInputs,
  imageParts: Array<{ type: 'input_image'; image_url: string; detail: 'high' | 'low' | 'auto' }>,
  options: { timeoutMs?: number } = {}
): Promise<VisionAnalysis> {
  const model = getConfiguredOpenAIModel();
  const timeoutMs = options.timeoutMs ?? OPENAI_ANALYSIS_TIMEOUT_MS;

  const response = await withTimeout(
    client.responses.parse({
      model,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: buildAnalysisPrompt(inputs) },
            ...imageParts
          ]
        }
      ],
      text: {
        format: zodTextFormat(visionAnalysisSchema, 'whs_job_photo_analysis')
      }
    }),
    timeoutMs
  );

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new AnalysisError('Model did not return a parsed structured analysis.', 'missing_structured_output');
  }

  return parsed;
}

export function buildAnalysisPrompt(inputs: JobInputs) {
  return `You are analyzing junk removal job photos for Wade Home Services in Orange County, CA.

Return a conservative structured estimate using compacted/loaded volume, not loose unprocessed appearance.

Business context:
- Trailer capacity is 12 cubic yards.
- Full-load baseline is $450, but do not calculate the quote.
- Distinguish observed photo facts from employee-provided facts, assumptions, uncertainty, warnings, and follow-up questions.
- Treat hidden material as uncertainty unless it is visible or explicitly provided.
- Flag concrete, dirt, tile, drywall, appliances, demolition debris, cinder blocks, roofing, or very dense materials.
- Never guarantee a final price from photos alone.

Employee inputs:
${JSON.stringify({
    distanceTier: inputs.distanceTier,
    jobType: inputs.jobType,
    carryDistance: inputs.carryDistance,
    stairs: inputs.stairs,
    workers: inputs.workers,
    notes: inputs.notes
  })}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new AnalysisError('AI analysis timed out.', 'timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
