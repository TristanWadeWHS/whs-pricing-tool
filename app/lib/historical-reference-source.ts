import 'server-only';
import { createPrivateReferenceCache, readReferenceRecords } from './historical-reference-data';

// Process-private, bounded, single-flight cache; no disk, Next cache or CDN storage.
export const loadHistoricalReferences = createPrivateReferenceCache(() => readReferenceRecords());
