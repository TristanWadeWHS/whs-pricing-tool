import type { ConversationModel, ConversationState } from './conversation-schema';

// Estimates are already loaded/packed cubic yards. Never apply another compaction factor.
export function reconcileLoadedVolume(state: ConversationState, model: ConversationModel, safeText: (text: string) => string) {
  const included = new Map(state.items.filter((i) => i.choice === 'included').map((i) => [i.id, i]));
  const covered = new Set<string>(), blockers: string[] = [], assumptions: string[] = [], handling: string[] = [];
  let low = 0, high = 0;
  for (const group of model.loadedGroups) {
    const labels = group.itemIds.map((id) => included.get(id)?.label ?? id).join(', ');
    if (group.itemIds.some((id) => !included.has(id))) { blockers.push('The loaded-volume groups include unconfirmed, excluded or duplicate-view items. Confirm only the removal items.'); continue; }
    if (group.itemIds.some((id) => covered.has(id)) || new Set(group.itemIds).size !== group.itemIds.length) {
      blockers.push(`The loaded-volume calculation counts ${labels} more than once. Review overlapping groups before estimating.`); continue;
    }
    group.itemIds.forEach((id) => covered.add(id));
    if (!group.photoRefs.length || group.photoRefs.some((ref) => ref > state.photoHashes.length || !group.itemIds.some((id) => included.get(id)!.photoRefs.includes(ref)))
      || !model.analysis.observedFacts.includes(group.evidence)) {
      blockers.push(`The volume estimate for ${labels} needs a supporting observation from the supplied photos.`); continue;
    }
    const answers = state.answers.filter((answer) => group.itemIds.some((id) => answer.id.startsWith(`${id}:`)));
    if (answers.some((answer) => !group.answerIds.includes(answer.id)) || group.answerIds.some((id) => !answers.some((answer) => answer.id === id))) {
      blockers.push(`The volume estimate for ${labels} has not accounted for the customer's recorded answers.`); continue;
    }
    if (group.handlingConcern) handling.push(`${labels}: ${safeText(group.handlingConcern)} Volume only; handling, payload and disposal need staff review. No surcharge has been added.`);
    const a = group.lowCubicYards, b = group.highCubicYards;
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b < a) {
      blockers.push(`${labels}: ${group.uncertainty && !/proof of concept|\bunbounded\b/i.test(group.uncertainty) ? safeText(group.uncertainty) : 'A usable loaded-volume estimate was not supplied for these items. Review their quantity and visible extent.'}`); continue;
    }
    if (a !== b && (!group.uncertainty || /proof of concept|\bunbounded\b/i.test(group.uncertainty))) {
      blockers.push(`The volume range for ${labels} needs an explanation of what changes between its endpoints.`); continue;
    }
    low += a; high += b;
    const display = (value: number) => Number(value.toFixed(3));
    assumptions.push(`${labels} (${safeText(group.quantityDescription)}): model-estimated ${a === b ? display(a) : `${display(a)}-${display(b)}`} loaded cubic yards. ${group.packingAssumptions.map(safeText).join(' ')}`);
    if (group.uncertainty) assumptions.push(`${labels}: ${safeText(group.uncertainty)}`);
  }
  const missing = [...included.values()].filter((i) => !covered.has(i.id));
  if (missing.length) blockers.push(`Missing loaded-volume estimates for: ${missing.map((i) => i.label).join(', ')}. These included groups must be accounted for.`);
  // This patch does not change the shared calculator's existing supported percentage domain.
  const percent = (yards: number) => Number((yards / 12 * 100).toFixed(6));
  const lowPercent = percent(low), highPercent = percent(high);
  if (!blockers.length && included.size && (lowPercent < 1 || highPercent > 200)) {
    blockers.push(`The estimated loaded volume is ${Number(low.toFixed(3))}-${Number(high.toFixed(3))} cubic yards. Its endpoints fall outside the existing calculator's 1%-200% range; staff must price that specific volume. No value was clamped or replaced.`);
  }
  return { blockers, assumptions, handling,
    percent: percent((low + high) / 2), rangeText: lowPercent === highPercent ? `${lowPercent}%` : `${lowPercent}-${highPercent}%` };
}
