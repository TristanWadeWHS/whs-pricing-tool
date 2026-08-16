import { z } from 'zod';

export const riskLevelSchema = z.enum(['low', 'medium', 'high']);
export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export const photoQualitySchema = z.enum(['poor', 'fair', 'good']);

export const visionAnalysisSchema = z.object({
  estimatedLoadPercent: z.number().min(1).max(200),
  estimatedLoadRange: z.string().min(1).max(120),
  estimatedLoadCount: z.number().min(0.1).max(10),
  materialType: z.string().min(1).max(160),
  materialTypes: z.array(z.string().min(1).max(80)).max(12),
  heavyDebrisRisk: riskLevelSchema,
  difficulty: difficultySchema,
  photoAngleQuality: photoQualitySchema,
  confidencePercent: z.number().min(1).max(100),
  hiddenDebrisRisk: riskLevelSchema,
  visibleItems: z.array(z.string().min(1).max(120)).max(30),
  observedFacts: z.array(z.string().min(1).max(180)).max(20),
  employeeProvidedFacts: z.array(z.string().min(1).max(180)).max(20),
  assumptions: z.array(z.string().min(1).max(180)).max(20),
  uncertaintyNotes: z.array(z.string().min(1).max(180)).max(20),
  warnings: z.array(z.string().min(1).max(220)).max(20),
  questionsToAsk: z.array(z.string().min(1).max(220)).max(20)
}).strict();

export type VisionAnalysis = z.infer<typeof visionAnalysisSchema>;

export function parseVisionAnalysis(value: unknown) {
  return visionAnalysisSchema.safeParse(value);
}

