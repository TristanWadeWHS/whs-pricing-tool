import { google } from 'googleapis';

export const SHADOW_BENCHMARK_SHEET_GID = 969595299;
export const SHADOW_BENCHMARK_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const EXPECTED_SPREADSHEET_ID = '1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI';
const EXPECTED_TAB_NAME = 'ML Data';

const FEATURE_DEFINITION_VERSION = 'shadow-pricing-v2';
const TARGET_DEFINITION_VERSION = 'canonical-final-completed-price-v2';
export const TIERS = ['small_routine', 'mid_tier', 'large_project', 'special_risk_manual_review', 'unknown_inputs'] as const;
export const MIN_TIER_TRAIN = 8;

export type ShadowPricingRawRecord = Record<string, string>;

export type ShadowPricingRecord = {
  rowNumber: number;
  estimateDate: Date;
  targetFinalCompletedPrice: number;
  tier: ShadowPricingTier;
  features: ShadowPricingFeatures;
};

export type ShadowPricingTier = typeof TIERS[number];

export type ShadowPricingFeatures = {
  estimateMonth: number;
  estimateYear: number;
  serviceType: string;
  cityRegion: string;
  distanceTier: string;
  estimatedLoadCount: number | null;
  plannedWorkers: number | null;
  stairs: boolean | null;
  carryDistance: string;
  heavyItems: boolean | null;
  demoRequired: boolean | null;
};

export type ShadowBenchmarkModelName =
  | 'global_historical_median'
  | 'deterministic_job_tier_median'
  | 'comparable_job_retrieval'
  | 'huber_regression'
  | 'regularized_quantile_regression';

export type ShadowBenchmarkMetric = {
  model: ShadowBenchmarkModelName;
  evaluatedRows: number;
  mae: number | null;
  medianAbsoluteError: number | null;
  rmse: number | null;
  meanAbsolutePercentageError: number | null;
  belowHistoricalPriceFrequency: number | null;
  totalShortfallVsHistoricalPrice: number | null;
  largeShortfallVsHistoricalPriceFrequency: number | null;
  quantileCoverage: number | null;
};

export type ShadowBenchmarkResult = {
  status: 'ok' | 'blocked';
  blockedReason?: string;
  manifest?: ShadowBenchmarkManifest;
  dataset?: {
    returnedRows: number;
    eligibleRows: number;
    excludedRows: number;
    fieldBlockers: Record<string, number>;
    dateCoverage: { earliest: string | null; latest: string | null };
    tierDistribution: Record<ShadowPricingTier, number>;
    featureAllowlist: string[];
    leakageExclusions: string[];
    target: string;
  };
  evaluation?: {
    method: string;
    foldCount: number;
    trainWindow: string;
    metrics: ShadowBenchmarkMetric[];
    holdoutRows: number;
    matchedRows: number;
    excludedFromMatchedRows: number;
    foldBoundaries: Array<{ trainEnd: string | null; testStart: string | null; testEnd: string | null; trainRows: number; testRows: number }>;
    perTier: Array<{ tier: ShadowPricingTier; eligibleRows: number; holdoutRows: number; matchedRows: number; metrics: ShadowBenchmarkMetric[] }>;
    availability: Array<{ model: ShadowBenchmarkModelName; predictedRows: number; abstentions: Record<string, number> }>;
    diagnosticGlobalMedian: ShadowBenchmarkMetric;
    quantile: { status: 'unavailable'; nominalCoverage: number; reason: string };
    bestBaseline: ShadowBenchmarkModelName | null;
    bestStatisticalChallenger: ShadowBenchmarkModelName | null;
    decision: 'NO_MODEL_READY' | 'SHADOW_MODEL_READY' | 'CANDIDATE_FOR_INTERNAL_REVIEW';
    decisionReason: string;
    recommendedBenchmarkCandidates: ShadowBenchmarkModelName[];
  };
  privacy: {
    rawRowsReturned: boolean;
    rowLevelPredictionsReturned: boolean;
    reversibleRowHashesReturned: boolean;
    secretValuesReturned: boolean;
  };
};

export type ShadowBenchmarkManifest = {
  manifestVersion: string;
  generatedAt: string;
  sourceAlias: string;
  tabName: string;
  worksheetGid: number;
  returnedRows: number;
  eligibleRows: number;
  dateRange: { earliest: string | null; latest: string | null };
  featureDefinitionVersion: string;
  targetDefinitionVersion: string;
  codeCommit: string;
};

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
};

type Fold = {
  train: ShadowPricingRecord[];
  test: ShadowPricingRecord[];
};

type Prediction = {
  actual: number;
  predicted: number;
  tier: ShadowPricingTier;
  lower?: number;
  upper?: number;
};

export const SHADOW_PRICING_FEATURE_ALLOWLIST = [
  'estimate_month',
  'estimate_year',
  'service_type',
  'city_service_region',
  'distance_tier',
  'estimated_load_count',
  'planned_workers',
  'stairs',
  'carry_distance',
  'heavy_items',
  'demo_required'
];

export const SHADOW_PRICING_LEAKAGE_EXCLUSIONS = [
  'actual_load_count',
  'actual_labor_hours',
  'actual_disposal_cost',
  'direct_job_cost',
  'gross_margin',
  'won_job',
  'completed_status',
  'completed_date',
  'accepted_price',
  'manager_override',
  'loss_or_cancel_reason',
  'customer_name',
  'phone',
  'email',
  'address',
  'notes_free_text',
  'photo_references',
  'raw_prompts',
  'raw_model_responses'
];

const CATEGORICAL_FEATURES: (keyof ShadowPricingFeatures)[] = [
  'serviceType',
  'cityRegion',
  'distanceTier',
  'carryDistance'
];

const NUMERIC_FEATURES: (keyof ShadowPricingFeatures)[] = [
  'estimateMonth',
  'estimateYear',
  'estimatedLoadCount',
  'plannedWorkers'
];

const BOOLEAN_FEATURES: (keyof ShadowPricingFeatures)[] = [
  'stairs',
  'heavyItems',
  'demoRequired'
];

export function parseCurrency(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const numeric = Number(trimmed.replace(/[,$()\s]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return negative ? -numeric : numeric;
}

export function parseDate(value: string | undefined): Date | null {
  const trimmed = (value ?? '').trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !us) return null;
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(us![3]), Number(us![1]), Number(us![2])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function parseBooleanLike(value: string | undefined): boolean | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'none'].includes(normalized)) return false;
  return null;
}

function parseNumber(value: string | undefined): number | null {
  const text = (value ?? '').replace(/,/g, '').trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeCategory(value: string | undefined, fallback = 'unknown') {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  return normalized || fallback;
}

function valueFor(row: ShadowPricingRawRecord, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  return '';
}

export function classifyShadowPricingTier(features: ShadowPricingFeatures): ShadowPricingTier {
  const loadCount = features.estimatedLoadCount;
  const workers = features.plannedWorkers;
  if (loadCount === null || workers === null || features.stairs === null ||
      features.heavyItems === null || features.demoRequired === null ||
      !['short', 'short_carry', 'medium', 'medium_carry', 'long', 'long_carry'].includes(features.carryDistance)) {
    return 'unknown_inputs';
  }
  const carry = features.carryDistance;
  const heavy = features.heavyItems === true;
  const demo = features.demoRequired === true;
  const stairs = features.stairs === true;

  if (demo && (heavy || workers >= 3 || loadCount >= 2)) return 'special_risk_manual_review';
  if (loadCount >= 2 || workers >= 3) return 'large_project';
  if (loadCount >= 1 || heavy || demo || stairs || carry.includes('long')) return 'mid_tier';
  return 'small_routine';
}

export function buildShadowPricingRecords(rawRows: ShadowPricingRawRecord[]) {
  const records: ShadowPricingRecord[] = [];
  const returnedRows = rawRows.length;
  const fieldBlockers: Record<string, number> = {};
  const block = (name: string) => { fieldBlockers[name] = (fieldBlockers[name] ?? 0) + 1; };

  for (const [index, row] of rawRows.entries()) {
    // Legacy Date/Amount/Workers are not evidence of estimate-time/completed-price provenance.
    const estimateDate = parseDate(row.estimate_date);
    const price = parseCurrency(row.final_completed_price);
    if (!estimateDate) block('missing_or_invalid_canonical_estimate_date');
    if (price === null || price <= 0) block('missing_or_invalid_canonical_final_completed_price');

    const features: ShadowPricingFeatures = {
      estimateMonth: estimateDate ? estimateDate.getUTCMonth() + 1 : 0,
      estimateYear: estimateDate ? estimateDate.getUTCFullYear() : 0,
      serviceType: normalizeCategory(row.service_type),
      cityRegion: normalizeCategory(row.city),
      distanceTier: normalizeCategory(row.distance_tier),
      estimatedLoadCount: parseNumber(row.estimated_load_count),
      // Schema V2 explicitly defines lowercase workers as planned count. Blank wins.
      plannedWorkers: parseNumber(valueFor(row, ['planned_workers', 'workers'])),
      stairs: parseBooleanLike(row.stairs),
      carryDistance: normalizeCategory(row.carry_distance),
      heavyItems: parseBooleanLike(row.heavy_items),
      demoRequired: parseBooleanLike(row.demo_required)
    };
    const tier = classifyShadowPricingTier(features);
    if (tier === 'unknown_inputs') block('missing_or_invalid_tier_inputs');
    if (!estimateDate || price === null || price <= 0) continue;

    records.push({
      rowNumber: index + 2,
      estimateDate,
      targetFinalCompletedPrice: price,
      tier,
      features
    });
  }

  return { returnedRows, records, fieldBlockers };
}

export function createTimeAwareFolds(records: ShadowPricingRecord[]): Fold[] {
  const sorted = [...records].sort((a, b) => a.estimateDate.getTime() - b.estimateDate.getTime());
  if (sorted.length < 12) return [];

  const minTrain = Math.max(8, Math.min(30, Math.floor(sorted.length * 0.45)));
  const foldSize = Math.max(3, Math.floor((sorted.length - minTrain) / 4));
  const folds: Fold[] = [];

  const afterDateGroup = (index: number) => {
    while (index < sorted.length && sorted[index].estimateDate.getTime() === sorted[index - 1].estimateDate.getTime()) index += 1;
    return index;
  };
  for (let start = afterDateGroup(minTrain); start < sorted.length;) {
    const end = afterDateGroup(Math.min(start + foldSize, sorted.length));
    const test = sorted.slice(start, end);
    folds.push({ train: sorted.slice(0, start), test });
    start = end;
  }

  return folds;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clampPrice(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function globalMedianPredictor(train: ShadowPricingRecord[]) {
  const fallback = median(train.map((record) => record.targetFinalCompletedPrice));
  return () => fallback;
}

function comparablePredictor(train: ShadowPricingRecord[]) {
  const numericStats = buildNumericStats(train);
  const fallback = median(train.map((record) => record.targetFinalCompletedPrice));
  return (record: ShadowPricingRecord) => {
    const neighbors = train
      .map((candidate) => ({
        price: candidate.targetFinalCompletedPrice,
        distance: mixedFeatureDistance(record, candidate, numericStats)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.min(5, train.length));

    if (!neighbors.length) return fallback;
    const weighted = neighbors.reduce((sum, neighbor) => sum + neighbor.price / (neighbor.distance + 0.25), 0);
    const weight = neighbors.reduce((sum, neighbor) => sum + 1 / (neighbor.distance + 0.25), 0);
    return clampPrice(weighted / weight);
  };
}

export function buildNumericStats(train: ShadowPricingRecord[]) {
  const stats = new Map<keyof ShadowPricingFeatures, { median: number; scale: number }>();
  for (const key of NUMERIC_FEATURES) {
    const values = train
      .map((record) => record.features[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const med = median(values);
    const deviations = values.map((value) => Math.abs(value - med));
    stats.set(key, { median: med, scale: Math.max(1, median(deviations) || 1) });
  }
  return stats;
}

function mixedFeatureDistance(
  a: ShadowPricingRecord,
  b: ShadowPricingRecord,
  numericStats: Map<keyof ShadowPricingFeatures, { median: number; scale: number }>
) {
  let distance = a.tier === b.tier ? 0 : 1.5;

  for (const key of CATEGORICAL_FEATURES) {
    distance += a.features[key] === b.features[key] ? 0 : 1;
  }

  for (const key of BOOLEAN_FEATURES) {
    const av = a.features[key];
    const bv = b.features[key];
    distance += av === bv ? 0 : av === null || bv === null ? 0.5 : 1;
  }

  for (const key of NUMERIC_FEATURES) {
    const stats = numericStats.get(key) ?? { median: 0, scale: 1 };
    const av = a.features[key] === null ? stats.median : Number(a.features[key]);
    const bv = b.features[key] === null ? stats.median : Number(b.features[key]);
    distance += Math.min(3, Math.abs(av - bv) / stats.scale);
  }

  return distance;
}

function vectorize(train: ShadowPricingRecord[]) {
  const categories = new Map<string, string[]>();
  for (const key of CATEGORICAL_FEATURES) {
    categories.set(
      key,
      Array.from(new Set(train.map((record) => String(record.features[key] || 'unknown')))).sort()
    );
  }
  const stats = buildNumericStats(train);

  const encode = (record: ShadowPricingRecord) => {
    const vector = [1];
    for (const key of NUMERIC_FEATURES) {
      const stat = stats.get(key) ?? { median: 0, scale: 1 };
      const raw = record.features[key] === null ? stat.median : Number(record.features[key]);
      vector.push((raw - stat.median) / stat.scale);
    }
    for (const key of BOOLEAN_FEATURES) {
      const value = record.features[key];
      vector.push(value === true ? 1 : value === false ? 0 : 0.5);
    }
    for (const key of CATEGORICAL_FEATURES) {
      const allowed = categories.get(key) ?? [];
      for (const category of allowed) {
        vector.push(record.features[key] === category ? 1 : 0);
      }
    }
    return vector;
  };

  return { encode };
}

function trainHuberModel(train: ShadowPricingRecord[]) {
  const { encode } = vectorize(train);
  const x = train.map(encode);
  const prices = train.map((record) => record.targetFinalCompletedPrice);
  const center = median(prices);
  const scale = Math.max(1, median(prices.map((price) => Math.abs(price - center))));
  const y = prices.map((price) => (price - center) / scale);
  const dims = x[0]?.length ?? 1;
  if (train.length < Math.max(20, 2 * dims)) return null;
  const weights = new Array(dims).fill(0);
  const l2 = 0.001;
  // A training-only Lipschitz bound gives a conservative step for convex Huber loss.
  const rate = 1 / (average(x.map((vector) => dot(vector, vector))) + l2);
  let converged = false;

  for (let iteration = 0; iteration < 10000; iteration += 1) {
    const gradients = new Array(dims).fill(0);
    for (let i = 0; i < x.length; i += 1) {
      const prediction = dot(weights, x[i]);
      const residual = prediction - y[i];
      const gradientScale = Math.max(-1, Math.min(1, residual));
      for (let j = 0; j < dims; j += 1) {
        gradients[j] += (gradientScale * x[i][j]) / x.length;
      }
    }
    for (let j = 1; j < dims; j += 1) gradients[j] += l2 * weights[j];
    if (gradients.every((gradient) => Number.isFinite(gradient) && Math.abs(gradient) <= 1e-5)) {
      converged = true;
      break;
    }
    for (let j = 0; j < dims; j += 1) weights[j] -= rate * gradients[j];
  }

  if (!converged) return null;
  return (record: ShadowPricingRecord) => Math.max(0, center + scale * dot(weights, encode(record)));
}

function dot(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

type Forecast = { predicted: number | null; reason: string | null };

export function fitTierPredictor(model: ShadowBenchmarkModelName, train: ShadowPricingRecord[], tier: ShadowPricingTier) {
  const abstain = (reason: string) => (_record: ShadowPricingRecord): Forecast => ({ predicted: null, reason });
  if (model === 'regularized_quantile_regression') return abstain('quantile_solver_unavailable');
  if (tier === 'unknown_inputs') return abstain('unknown_tier_inputs');
  if (tier === 'large_project' || tier === 'special_risk_manual_review') return abstain('component_pricing_manager_review');
  const segment = train.filter((record) => record.tier === tier);
  if (segment.length < MIN_TIER_TRAIN) return abstain('insufficient_same_tier_training');
  const predictor = model === 'huber_regression' ? trainHuberModel(segment)
    : model === 'comparable_job_retrieval' ? comparablePredictor(segment) : globalMedianPredictor(segment);
  if (!predictor) return abstain('huber_insufficient_training_or_nonconvergence');
  const trainEnd = Math.max(...segment.map((record) => record.estimateDate.getTime()));
  return (record: ShadowPricingRecord): Forecast => {
    if (record.tier !== tier || record.estimateDate.getTime() <= trainEnd) return { predicted: null, reason: 'invalid_holdout' };
    const predicted = predictor(record);
    return Number.isFinite(predicted) ? { predicted, reason: null } : { predicted: null, reason: 'nonfinite_prediction' };
  };
}

export function intervalCoverage(intervals: Array<{ actual: number; lower: number; upper: number }>) {
  // Reject crossing rather than silently sorting mislabeled quantiles.
  const valid = intervals.filter(({ actual, lower, upper }) => [actual, lower, upper].every(Number.isFinite) && lower <= upper);
  return {
    nominalCoverage: 0.6,
    validIntervals: valid.length,
    invalidIntervals: intervals.length - valid.length,
    coverage: valid.length ? valid.filter(({ actual, lower, upper }) => lower <= actual && actual <= upper).length / valid.length : null
  };
}

export function runShadowPricingBenchmark(rawRows: ShadowPricingRawRecord[], codeCommit = 'local-worktree'): ShadowBenchmarkResult {
  const { returnedRows, records, fieldBlockers } = buildShadowPricingRecords(rawRows);
  const folds = createTimeAwareFolds(records);
  const models: ShadowBenchmarkModelName[] = [
    'deterministic_job_tier_median',
    'comparable_job_retrieval',
    'huber_regression'
  ];
  const matched = models.map(() => [] as Prediction[]);
  const availability = models.map((model) => ({ model, predictedRows: 0, abstentions: {} as Record<string, number> }));
  const holdout: ShadowPricingRecord[] = [];
  const diagnostic: Prediction[] = [];
  for (const fold of folds) {
    const fitted = models.map((model) => new Map(TIERS.map((tier) => [tier, fitTierPredictor(model, fold.train, tier)])));
    const globalMedian = globalMedianPredictor(fold.train);
    for (const record of fold.test) {
      holdout.push(record);
      const actual = record.targetFinalCompletedPrice;
      diagnostic.push({ actual, predicted: globalMedian(), tier: record.tier });
      const forecasts = fitted.map((byTier) => byTier.get(record.tier)!(record));
      forecasts.forEach((forecast, index) => {
        if (forecast.predicted !== null) availability[index].predictedRows += 1;
        else {
          const reason = forecast.reason!;
          availability[index].abstentions[reason] = (availability[index].abstentions[reason] ?? 0) + 1;
        }
      });
      // Compare all available methods on the exact same held-out records.
      if (forecasts.every((forecast) => forecast.predicted !== null)) {
        forecasts.forEach((forecast, index) => matched[index].push({ actual, predicted: forecast.predicted!, tier: record.tier }));
      }
    }
  }
  const metrics = models.map((model, index) => aggregatePredictions(model, matched[index]));
  const matchedRows = matched[0].length;
  const validEvaluation = folds.length >= 2 && matchedRows > 0;
  const dates = records.map((record) => record.estimateDate).sort((a, b) => a.getTime() - b.getTime());
  const tierDistribution = tierCounts(records);

  return {
    status: validEvaluation ? 'ok' : 'blocked',
    blockedReason: validEvaluation ? undefined : 'Insufficient canonical provenance, date groups, or matching same-tier predictions. No ranking is valid.',
    manifest: createManifest(returnedRows, records, codeCommit),
    dataset: {
      returnedRows,
      eligibleRows: records.length,
      excludedRows: returnedRows - records.length,
      fieldBlockers,
      dateCoverage: {
        earliest: formatDate(dates[0]),
        latest: formatDate(dates[dates.length - 1])
      },
      tierDistribution,
      featureAllowlist: SHADOW_PRICING_FEATURE_ALLOWLIST,
      leakageExclusions: SHADOW_PRICING_LEAKAGE_EXCLUSIONS,
      target: 'final_completed_price'
    },
    evaluation: {
      method: 'time_aware_expanding_blocked_holdout',
      foldCount: folds.length,
      trainWindow: 'Every fold trains only on rows earlier than its contiguous holdout block.',
      metrics,
      holdoutRows: holdout.length,
      matchedRows,
      excludedFromMatchedRows: holdout.length - matchedRows,
      foldBoundaries: folds.map((fold) => ({ trainEnd: formatDate(fold.train.at(-1)?.estimateDate), testStart: formatDate(fold.test[0]?.estimateDate), testEnd: formatDate(fold.test.at(-1)?.estimateDate), trainRows: fold.train.length, testRows: fold.test.length })),
      perTier: TIERS.map((tier) => ({ tier, eligibleRows: tierDistribution[tier], holdoutRows: holdout.filter((record) => record.tier === tier).length,
        matchedRows: matched[0].filter((prediction) => prediction.tier === tier).length,
        metrics: models.map((model, index) => aggregatePredictions(model, matched[index].filter((prediction) => prediction.tier === tier))) })),
      availability,
      diagnosticGlobalMedian: aggregatePredictions('global_historical_median', diagnostic),
      quantile: { status: 'unavailable', nominalCoverage: 0.6, reason: 'No validated convergent quantile solver is installed; earlier results are invalid methodology evidence.' },
      bestBaseline: null,
      bestStatisticalChallenger: null,
      decision: 'NO_MODEL_READY',
      decisionReason: 'No automatic ranking or promotion. Canonical provenance, sufficient segmented holdouts, and independent validation are required. Global median is diagnostic only.',
      recommendedBenchmarkCandidates: models
    },
    privacy: privacyGuarantee()
  };
}

export function aggregatePredictions(model: ShadowBenchmarkModelName, predictions: Prediction[]): ShadowBenchmarkMetric {
  const absErrors = predictions.map((prediction) => Math.abs(prediction.actual - prediction.predicted));
  const squaredErrors = predictions.map((prediction) => (prediction.actual - prediction.predicted) ** 2);
  const pctErrors = predictions.map((prediction) => Math.abs(prediction.actual - prediction.predicted) / prediction.actual);
  const underpriced = predictions.filter((prediction) => prediction.predicted < prediction.actual);
  const largeUnderquotes = predictions.filter((prediction) => prediction.actual - prediction.predicted >= Math.max(250, prediction.actual * 0.2));

  return {
    model,
    evaluatedRows: predictions.length,
    mae: predictions.length ? roundMoney(average(absErrors)) : null,
    medianAbsoluteError: predictions.length ? roundMoney(median(absErrors)) : null,
    rmse: predictions.length ? roundMoney(Math.sqrt(average(squaredErrors))) : null,
    meanAbsolutePercentageError: predictions.length ? roundRate(average(pctErrors)) : null,
    belowHistoricalPriceFrequency: predictions.length ? roundRate(underpriced.length / predictions.length) : null,
    totalShortfallVsHistoricalPrice: predictions.length ? roundMoney(
      underpriced.reduce((sum, prediction) => sum + prediction.actual - prediction.predicted, 0)
    ) : null,
    largeShortfallVsHistoricalPriceFrequency: predictions.length ? roundRate(largeUnderquotes.length / predictions.length) : null,
    quantileCoverage: model === 'regularized_quantile_regression' ? intervalCoverage(predictions.map((prediction) => ({ actual: prediction.actual, lower: prediction.lower ?? NaN, upper: prediction.upper ?? NaN }))).coverage : null
  };
}

function tierCounts(records: ShadowPricingRecord[]) {
  const counts: Record<ShadowPricingTier, number> = {
    small_routine: 0,
    mid_tier: 0,
    large_project: 0,
    special_risk_manual_review: 0,
    unknown_inputs: 0
  };
  for (const record of records) counts[record.tier] += 1;
  return counts;
}

function createManifest(returnedRows: number, records: ShadowPricingRecord[], codeCommit: string): ShadowBenchmarkManifest {
  const dates = records.map((record) => record.estimateDate).sort((a, b) => a.getTime() - b.getTime());

  return {
    manifestVersion: 'shadow-pricing-benchmark-manifest-v2',
    generatedAt: new Date().toISOString(),
    sourceAlias: 'authorized_historical_ml_data_sheet',
    tabName: EXPECTED_TAB_NAME,
    worksheetGid: SHADOW_BENCHMARK_SHEET_GID,
    returnedRows,
    eligibleRows: records.length,
    dateRange: {
      earliest: formatDate(dates[0]),
      latest: formatDate(dates[dates.length - 1])
    },
    featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
    targetDefinitionVersion: TARGET_DEFINITION_VERSION,
    codeCommit
  };
}

function formatDate(date: Date | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function privacyGuarantee() {
  return {
    rawRowsReturned: false,
    rowLevelPredictionsReturned: false,
    reversibleRowHashesReturned: false,
    secretValuesReturned: false
  };
}

export function rowsFromSheetValues(values: string[][]): ShadowPricingRawRecord[] {
  const [headers = [], ...rows] = values;
  return rows
    .filter((row) => row.some((cell) => String(cell ?? '').trim()))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [String(header ?? '').trim(), String(row[index] ?? '')]))
    );
}

function parseServiceAccountJson(raw: string): ServiceAccountJson {
  const parsed = JSON.parse(raw) as ServiceAccountJson;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON is missing required authentication fields.');
  }
  return parsed;
}

export async function readShadowBenchmarkRows(env = process.env): Promise<ShadowPricingRawRecord[]> {
  if (env.GOOGLE_SPREADSHEET_ID !== EXPECTED_SPREADSHEET_ID) {
    throw new Error('Configured spreadsheet does not match the approved historical benchmark source.');
  }
  if ((env.GOOGLE_SHEET_TAB ?? EXPECTED_TAB_NAME) !== EXPECTED_TAB_NAME) {
    throw new Error('Configured worksheet tab does not match the approved ML Data tab.');
  }
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is unavailable for read-only benchmark access.');
  }

  const serviceAccount = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [SHADOW_BENCHMARK_READONLY_SCOPE]
  });
  const sheets = google.sheets({ version: 'v4', auth });
  try {
    // One read obtains values and verifies the authorized tab's numeric identity.
    const response = await sheets.spreadsheets.get({
      spreadsheetId: EXPECTED_SPREADSHEET_ID,
      ranges: [EXPECTED_TAB_NAME],
      includeGridData: true,
      fields: 'sheets(properties(sheetId,title),data(rowData(values(formattedValue))))'
    }, { retry: false, timeout: 30000 });
    const sheet = response.data.sheets?.[0];
    if (response.data.sheets?.length !== 1 || sheet?.properties?.sheetId !== SHADOW_BENCHMARK_SHEET_GID || sheet.properties.title !== EXPECTED_TAB_NAME) {
      throw new Error('Authorized worksheet identity mismatch.');
    }
    const values = sheet.data?.[0]?.rowData?.map((row) => (row.values ?? []).map((cell) => cell.formattedValue ?? '')) ?? [];
    return rowsFromSheetValues(values);
  } finally {
    delete serviceAccount.private_key;
    delete serviceAccount.client_email;
    auth.key = undefined;
    auth.email = undefined;
    auth.setCredentials({});
  }
}
