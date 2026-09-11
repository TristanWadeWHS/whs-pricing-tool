import type { ShadowDiagnostics as Diagnostic } from './lib/shadow-diagnostics';
import { FACT_LABELS } from './lib/clarification-facts';
import styles from './shadow-diagnostics.module.css';

const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
const range = (value: { min: number; max: number }) => `${number(value.min)} to ${number(value.max)}`;

export function ShadowDiagnostics({ result }: { result: Diagnostic }) {
  return <section className={styles.diagnostics} aria-label="Internal Preview diagnostics">
    <h2>Internal Preview diagnostics</h2>
    <p>Shadow only. Does not change the estimate, quote eligibility or hauling approval.</p>
    {result.status === 'unavailable' ? <p>{result.reason}</p> : <>
      <h3>Attributed clarification facts</h3>
      <ul>{result.facts.map((fact) => <li key={fact.id}>
        {FACT_LABELS[fact.id]}: <strong>{fact.state.replaceAll('_', ' ')}</strong> ({fact.source.replaceAll('_', ' ')})
        {fact.conflictWithOriginal ? '; conflicts with original notes' : ''}
        {fact.contradictionPhotos.length ? `; model-reported ${fact.contradictionKinds.join(', ').replaceAll('_', ' ')} in photo ${fact.contradictionPhotos.join(', ')}, staff verification required` : ''}
      </li>)}</ul>
      <h3>Assessment readiness: {result.readiness.score === null ? 'unavailable' : `${number(result.readiness.score)}/100`}</h3>
      <p>{result.readiness.policy}</p>
      <div className={styles.tableScroll}><table><caption>Provisional evidence completeness</caption>
        <thead><tr><th scope="col">Component</th><th scope="col">Policy weight</th><th scope="col">Evidence checks</th></tr></thead>
        <tbody>{result.readiness.components.map((component) => <tr key={component.id}>
          <th scope="row">{component.label}</th><td>{number(component.effectiveWeight)}%</td>
          <td>{component.checks.map((check) => <div key={check.label}>{check.label}: {check.state.replaceAll('_', ' ')}</div>)}</td>
        </tr>)}</tbody></table></div>
      <p>{result.readiness.historicalSupport}</p>
      <h3>Inventory to loaded volume</h3>
      {result.volume.status === 'available' && result.volume.cubicYards && result.volume.loadEquivalents && result.volume.volumeOnlyTrips ? <>
        <p><strong>{range(result.volume.cubicYards)} cubic yards</strong>; {range(result.volume.loadEquivalents)} fractional 12-yard load equivalents.</p>
        <p>Volume-only whole-trip bounds: {range(result.volume.volumeOnlyTrips)}. Not a hauling plan.</p>
        <p>{result.volume.countedGroups} counted envelopes; {result.volume.omittedConstituents} contained entries not added; {result.volume.mergedViews} repeated views merged.</p>
        <ol>{result.volume.lines.map((line) => <li key={line.item}>
          Envelope {line.item}, photo {line.photoRefs.join(', ')}: {line.quantity} x [{line.dimensionsYards.map(range).join('] x [')}] yards x packing [{range(line.factor)}] = {range(line.cubicYards)} cubic yards.
          {' '}Source: {line.source.replaceAll('_', ' ')}; packing: {line.packing.replaceAll('_', ' ')}.
        </li>)}</ol>
      </> : <p>Volume unavailable; review inputs.</p>}
      <ul>{result.volume.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <p>Weight is separate. No numerical weight, density or legal payload is inferred. Payload evidence: unavailable.
        {result.volume.weight.dense ? ' Dense material flagged.' : ''}{result.volume.weight.restricted ? ' Restricted material flagged.' : ''}</p>
      <h3>Review blockers</h3>
      <ul>{result.readiness.blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    </>}
  </section>;
}
