import { VisionAnalysis } from './analysis-schema';

export type JobInputs = {
  distanceTier: 'under25' | '25to40' | '40to65';
  jobType: string;
  carryDistance: 'curbside' | 'short' | 'medium' | 'long';
  stairs: 'none' | 'some' | 'heavy';
  workers: number;
  notes: string;
};

export function priceJob(inputs: JobInputs, analysis: VisionAnalysis) {
  const minimums = { under25: 130, '25to40': 145, '40to65': 175 };
  const minPrice = minimums[inputs.distanceTier];

  const competitorFullLoadPrice = 650;
  const whsFullLoadPrice = 450;

  const rawLoadPercent = Number(analysis.estimatedLoadPercent);
  if (!Number.isFinite(rawLoadPercent)) {
    throw new Error('Pricing requires a valid estimated load percent.');
  }

  const loadPercent = Math.max(10, Math.min(200, rawLoadPercent));
  let base = Math.round((loadPercent / 100) * whsFullLoadPrice);

  base = Math.max(base, minPrice);

  let adjustments = 0;
  const adjustmentNotes: string[] = [];

  if (analysis.heavyDebrisRisk === 'medium') {
    adjustments += 50;
    adjustmentNotes.push('Medium heavy/debris risk adjustment');
  }

  if (analysis.heavyDebrisRisk === 'high') {
    adjustments += 125;
    adjustmentNotes.push('High heavy/demo/concrete risk adjustment');
  }

  if (analysis.hiddenDebrisRisk === 'medium') {
    adjustments += 35;
    adjustmentNotes.push('Possible hidden debris risk adjustment');
  }

  if (analysis.hiddenDebrisRisk === 'high') {
    adjustments += 85;
    adjustmentNotes.push('High hidden debris risk adjustment');
  }

  if (analysis.difficulty === 'medium') {
    adjustments += 35;
    adjustmentNotes.push('Medium labor difficulty adjustment');
  }

  if (analysis.difficulty === 'hard') {
    adjustments += 100;
    adjustmentNotes.push('Hard labor/access adjustment');
  }

  if (inputs.carryDistance === 'medium') {
    adjustments += 40;
    adjustmentNotes.push('Medium carry-distance adjustment');
  }

  if (inputs.carryDistance === 'long') {
    adjustments += 90;
    adjustmentNotes.push('Long carry-distance adjustment');
  }

  if (inputs.stairs === 'some') {
    adjustments += 40;
    adjustmentNotes.push('Stairs adjustment');
  }

  if (inputs.stairs === 'heavy') {
    adjustments += 100;
    adjustmentNotes.push('Heavy stairs adjustment');
  }

  if (inputs.jobType.toLowerCase().includes('cardboard')) {
    adjustments -= 40;
    adjustmentNotes.push('Cardboard-only discount applied');
  }

  const low = Math.max(minPrice, Math.round((base + adjustments - 35) / 5) * 5);
  const high = Math.max(low, Math.round((base + adjustments + 45) / 5) * 5);
  const suggested = Math.round(((low + high) / 2) / 5) * 5;

  const competitorEquivalent = Math.round((loadPercent / 100) * competitorFullLoadPrice);
  const estimatedSavings = Math.max(0, competitorEquivalent - suggested);

  return {
    minimumPrice: minPrice,
    baseLoadPrice: base,
    adjustments,
    adjustmentNotes,
    recommendedRange: `$${low}–$${high}`,
    suggestedQuote: suggested,
    competitorSummary: `According to the WHS pricing model, local competitors average around $${competitorFullLoadPrice} per trailer load. Based on this estimated load, a competitor-equivalent price may be around $${competitorEquivalent}. WHS suggested quote is $${suggested}, estimated customer savings of about $${estimatedSavings}.`,
    customerMessage: `Based on the photos and details provided, we can take care of this for $${suggested}. This includes loading, hauling, and proper disposal. Final price assumes the material shown is accurate and there is no hidden heavy/demo debris beyond what is visible. Please confirm if anything is underneath, behind, or not shown in the photos. If additional undeclared material is found on site, the price may increase.`
  };
}

export type PricingResult = ReturnType<typeof priceJob>;
