import crypto from 'node:crypto';
import { google } from 'googleapis';

export const SHADOW_BENCHMARK_SHEET_GID = 969595299;
export const SHADOW_BENCHMARK_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const EXPECTED_SPREADSHEET_ID = '1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI';
const EXPECTED_TAB_NAME = 'ML Data';

const FEATURE_DEFINITION_VERSION = 'shadow-pricing-v1';
const TARGET_DEFINITION_VERSION = 'final-completed-price-v1';

export type ShadowPricingRawRecord = Record<string, string>;

export type ShadowPricingRecord = {
  rowNumber: number;
  estimateDate: Date;
  targetFinalCompletedPrice: number;
  tier: ShadowPricingTier;
  features: ShadowPricingFeatures;
};

export type ShadowPricingTier = 'small_routine' | 'mid_tier' | 'large_project' | 'special_risk_manual_review';

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
  mae: number;
  medianAbsoluteError: number;
  rmse: number;
  meanAbsolutePercentageError: number;
  underpricingFrequency: number;
  totalUnderpricingDollars: number;
  largeUnderquoteFrequency: number;
  quantileCoverage: number | null;
};

export type ShadowBenchmarkResult = {
  status: 'ok' | 'blocked';
  blockedReason?: string;
  manifest?: ShadowBenchmarkManifest;
  dataset?: {
    returnedRows: number;
    eligibleRows: number;
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
    bestBaseline: ShadowBenchmarkModelName;
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
  datasetChecksum: string;
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
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseBooleanLike(value: string | undefined): boolean | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['true', 'yes', 'y', '1', 'completed', 'won'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'none', 'lost'].includes(normalized)) return false;
  return null;
}

function parseNumber(value: string | undefined): number | null {
  const numeric = Number((value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(numeric) ? numeric : null;
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
  const loadCount = features.estimatedLoadCount ?? 0;
  const workers = features.plannedWorkers ?? 0;
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
  let returnedRows = rawRows.length;

  for (const [index, row] of rawRows.entries()) {
    const estimateDate = parseDate(valueFor(row, ['Date', 'estimate_date']));
    const price = parseCurrency(valueFor(row, ['Amount', 'final_completed_price']));
    if (!estimateDate || price === null || price <= 0) continue;

    const features: ShadowPricingFeatures = {
      estimateMonth: estimateDate.getUTCMonth() + 1,
      estimateYear: estimateDate.getUTCFullYear(),
      serviceType: normalizeCategory(valueFor(row, ['Job Type', 'Service Type', 'service_type'])),
      cityRegion: normalizeCategory(valueFor(row, ['City', 'Service Region', 'city'])),
      distanceTier: normalizeCategory(valueFor(row, ['Distance', 'Distance Tier', 'distance_tier'])),
      estimatedLoadCount: parseNumber(valueFor(row, ['Estimated_Loads', 'Estimated Loads', 'estimated_load_count'])),
      plannedWorkers: parseNumber(valueFor(row, ['Workers', 'Workers Planned', 'planned_workers'])),
      stairs: parseBooleanLike(valueFor(row, ['Stairs', 'stairs'])),
      carryDistance: normalizeCategory(valueFor(row, ['Carry_Distance', 'Carry Distance', 'carry_distance'])),
      heavyItems: parseBooleanLike(valueFor(row, ['Heavy_Items', 'Heavy Items', 'heavy_items'])),
      demoRequired: parseBooleanLike(valueFor(row, ['Demo_Required', 'Demo Required', 'demo_required']))
    };

    records.push({
      rowNumber: index + 2,
      estimateDate,
      targetFinalCompletedPrice: price,
      tier: classifyShadowPricingTier(features),
      features
    });
  }

  return { returnedRows, records };
}

export function createTimeAwareFolds(records: ShadowPricingRecord[]): Fold[] {
  const sorted = [...records].sort((a, b) => a.estimateDate.getTime() - b.estimateDate.getTime());
  if (sorted.length < 12) return [];

  const minTrain = Math.max(8, Math.min(30, Math.floor(sorted.length * 0.45)));
  const foldSize = Math.max(3, Math.floor((sorted.length - minTrain) / 4));
  const folds: Fold[] = [];

  for (let start = minTrain; start < sorted.length; start += foldSize) {
    const test = sorted.slice(start, Math.min(start + foldSize, sorted.length));
    if (!test.length) continue;
    folds.push({ train: sorted.slice(0, start), test });
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

function tierMedianPredictor(train: ShadowPricingRecord[]) {
  const fallback = median(train.map((record) => record.targetFinalCompletedPrice));
  const byTier = new Map<ShadowPricingTier, number>();
  for (const tier of ['small_routine', 'mid_tier', 'large_project', 'special_risk_manual_review'] as const) {
    const tierValues = train.filter((record) => record.tier === tier).map((record) => record.targetFinalCompletedPrice);
    if (tierValues.length) byTier.set(tier, median(tierValues));
  }
  return (record: ShadowPricingRecord) => byTier.get(record.tier) ?? fallback;
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

function buildNumericStats(train: ShadowPricingRecord[]) {
  const stats = new Map<keyof ShadowPricingFeatures, { median: number; scale: number }>();
  for (const key of NUMERIC_FEATURES) {
    const values = train
      .map((record) => Number(record.features[key]))
      .filter((value) => Number.isFinite(value));
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
    const av = Number.isFinite(Number(a.features[key])) ? Number(a.features[key]) : stats.median;
    const bv = Number.isFinite(Number(b.features[key])) ? Number(b.features[key]) : stats.median;
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
      const raw = Number.isFinite(Number(record.features[key])) ? Number(record.features[key]) : stat.median;
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

function trainLinearModel(
  train: ShadowPricingRecord[],
  options: { loss: 'huber' | 'quantile'; tau?: number; l2: number; iterations?: number }
) {
  const { encode } = vectorize(train);
  const x = train.map(encode);
  const y = train.map((record) => record.targetFinalCompletedPrice);
  const dims = x[0]?.length ?? 1;
  const weights = new Array(dims).fill(0);
  weights[0] = median(y);
  const iterations = options.iterations ?? 700;
  const rate = 0.015;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradients = new Array(dims).fill(0);
    for (let i = 0; i < x.length; i += 1) {
      const prediction = dot(weights, x[i]);
      const residual = prediction - y[i];
      let gradientScale: number;
      if (options.loss === 'huber') {
        const delta = 250;
        gradientScale = Math.abs(residual) <= delta ? residual : delta * Math.sign(residual);
      } else {
        const tau = options.tau ?? 0.5;
        gradientScale = residual >= 0 ? 1 - tau : -tau;
      }
      for (let j = 0; j < dims; j += 1) {
        gradients[j] += (gradientScale * x[i][j]) / x.length;
      }
    }
    for (let j = 1; j < dims; j += 1) gradients[j] += options.l2 * weights[j];
    for (let j = 0; j < dims; j += 1) weights[j] -= rate * gradients[j];
  }

  return (record: ShadowPricingRecord) => clampPrice(dot(weights, encode(record)));
}

function dot(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

function predictForModel(model: ShadowBenchmarkModelName, train: ShadowPricingRecord[]) {
  if (model === 'global_historical_median') return globalMedianPredictor(train);
  if (model === 'deterministic_job_tier_median') return tierMedianPredictor(train);
  if (model === 'comparable_job_retrieval') return comparablePredictor(train);
  if (model === 'huber_regression') return trainLinearModel(train, { loss: 'huber', l2: 0.001 });

  const medianPredictor = trainLinearModel(train, { loss: 'quantile', tau: 0.5, l2: 0.001 });
  const lowerPredictor = trainLinearModel(train, { loss: 'quantile', tau: 0.2, l2: 0.001 });
  const upperPredictor = trainLinearModel(train, { loss: 'quantile', tau: 0.8, l2: 0.001 });
  return (record: ShadowPricingRecord) => {
    const lower = lowerPredictor(record);
    const upper = upperPredictor(record);
    return {
      predicted: medianPredictor(record),
      lower: Math.min(lower, upper),
      upper: Math.max(lower, upper)
    };
  };
}

export function runShadowPricingBenchmark(rawRows: ShadowPricingRawRecord[], codeCommit = 'local-worktree'): ShadowBenchmarkResult {
  const { returnedRows, records } = buildShadowPricingRecords(rawRows);
  const folds = createTimeAwareFolds(records);

  if (records.length < 12 || folds.length < 2) {
    return {
      status: 'blocked',
      blockedReason: 'Insufficient valid completed-price rows for a time-aware shadow benchmark.',
      privacy: privacyGuarantee()
    };
  }

  const models: ShadowBenchmarkModelName[] = [
    'global_historical_median',
    'deterministic_job_tier_median',
    'comparable_job_retrieval',
    'huber_regression',
    'regularized_quantile_regression'
  ];

  const metrics = models.map((model) => evaluateModel(model, folds));
  const baselineModels = metrics.filter((metric) =>
    ['global_historical_median', 'deterministic_job_tier_median', 'comparable_job_retrieval'].includes(metric.model)
  );
  const statisticalModels = metrics.filter((metric) =>
    ['huber_regression', 'regularized_quantile_regression'].includes(metric.model)
  );
  const bestBaseline = [...baselineModels].sort((a, b) => a.mae - b.mae)[0];
  const bestStatistical = [...statisticalModels].sort((a, b) => a.mae - b.mae)[0] ?? null;
  const improvement = bestStatistical ? (bestBaseline.mae - bestStatistical.mae) / bestBaseline.mae : 0;
  const decision =
    records.length < 150 || !bestStatistical || improvement < 0.05
      ? 'NO_MODEL_READY'
      : bestStatistical.underpricingFrequency <= bestBaseline.underpricingFrequency
        ? 'CANDIDATE_FOR_INTERNAL_REVIEW'
        : 'SHADOW_MODEL_READY';

  const dates = records.map((record) => record.estimateDate).sort((a, b) => a.getTime() - b.getTime());
  const tierDistribution = tierCounts(records);

  return {
    status: 'ok',
    manifest: createManifest(returnedRows, records, codeCommit),
    dataset: {
      returnedRows,
      eligibleRows: records.length,
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
      bestBaseline: bestBaseline.model,
      bestStatisticalChallenger: bestStatistical?.model ?? null,
      decision,
      decisionReason:
        decision === 'NO_MODEL_READY'
          ? 'The completed-job sample remains too small for Production ML, and statistical challengers must beat deterministic baselines in shadow evaluation before internal review.'
          : 'Shadow results merit internal review only; no Production promotion is implied.',
      recommendedBenchmarkCandidates: models
    },
    privacy: privacyGuarantee()
  };
}

function evaluateModel(model: ShadowBenchmarkModelName, folds: Fold[]): ShadowBenchmarkMetric {
  const predictions: Prediction[] = [];
  for (const fold of folds) {
    const predictor = predictForModel(model, fold.train);
    for (const record of fold.test) {
      const raw = predictor(record);
      if (typeof raw === 'number') {
        predictions.push({ actual: record.targetFinalCompletedPrice, predicted: raw, tier: record.tier });
      } else {
        predictions.push({
          actual: record.targetFinalCompletedPrice,
          predicted: raw.predicted,
          lower: raw.lower,
          upper: raw.upper,
          tier: record.tier
        });
      }
    }
  }
  return aggregatePredictions(model, predictions);
}

function aggregatePredictions(model: ShadowBenchmarkModelName, predictions: Prediction[]): ShadowBenchmarkMetric {
  const absErrors = predictions.map((prediction) => Math.abs(prediction.actual - prediction.predicted));
  const squaredErrors = predictions.map((prediction) => (prediction.actual - prediction.predicted) ** 2);
  const pctErrors = predictions.map((prediction) => Math.abs(prediction.actual - prediction.predicted) / prediction.actual);
  const underpriced = predictions.filter((prediction) => prediction.predicted < prediction.actual);
  const largeUnderquotes = predictions.filter((prediction) => prediction.actual - prediction.predicted >= Math.max(250, prediction.actual * 0.2));
  const covered = predictions.filter(
    (prediction) =>
      prediction.lower !== undefined &&
      prediction.upper !== undefined &&
      prediction.actual >= prediction.lower &&
      prediction.actual <= prediction.upper
  );

  return {
    model,
    evaluatedRows: predictions.length,
    mae: roundMoney(average(absErrors)),
    medianAbsoluteError: roundMoney(median(absErrors)),
    rmse: roundMoney(Math.sqrt(average(squaredErrors))),
    meanAbsolutePercentageError: roundRate(average(pctErrors)),
    underpricingFrequency: roundRate(underpriced.length / predictions.length),
    totalUnderpricingDollars: roundMoney(
      underpriced.reduce((sum, prediction) => sum + prediction.actual - prediction.predicted, 0)
    ),
    largeUnderquoteFrequency: roundRate(largeUnderquotes.length / predictions.length),
    quantileCoverage: model === 'regularized_quantile_regression' ? roundRate(covered.length / predictions.length) : null
  };
}

function tierCounts(records: ShadowPricingRecord[]) {
  const counts: Record<ShadowPricingTier, number> = {
    small_routine: 0,
    mid_tier: 0,
    large_project: 0,
    special_risk_manual_review: 0
  };
  for (const record of records) counts[record.tier] += 1;
  return counts;
}

function createManifest(returnedRows: number, records: ShadowPricingRecord[], codeCommit: string): ShadowBenchmarkManifest {
  const dates = records.map((record) => record.estimateDate).sort((a, b) => a.getTime() - b.getTime());
  const digest = crypto
    .createHash('sha256')
    .update(
      JSON.stringify(
        records.map((record) => ({
          d: formatDate(record.estimateDate),
          t: record.tier,
          f: record.features,
          yBucket: Math.round(record.targetFinalCompletedPrice / 50) * 50
        }))
      )
    )
    .digest('hex');

  return {
    manifestVersion: 'shadow-pricing-benchmark-manifest-v1',
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
    datasetChecksum: digest,
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
  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [SHADOW_BENCHMARK_READONLY_SCOPE]
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: EXPECTED_SPREADSHEET_ID,
    range: EXPECTED_TAB_NAME
  });

  return rowsFromSheetValues((response.data.values ?? []) as string[][]);
}
