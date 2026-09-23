import { Lightbulb } from 'lucide-react';
import { ARM_LABELS, type BenchmarkRun, type MetricSummary } from '../../shared/types';
import { latency } from '../lib/format';

export function RunInsight({ run, summaries }: { run: BenchmarkRun; summaries: MetricSummary[] }) {
  const foundry = summaries.find(item => item.arm === 'foundry');
  const jev = summaries.find(item => item.arm === 'jev');
  const hybrid = summaries.find(item => item.arm === 'hybrid');
  const unavailable = summaries.filter(item => item.total > 0 && item.successes === 0);
  const complete = run.status === 'completed' && run.observations.length === run.total
    && foundry && jev && hybrid && foundry.total === jev.total && jev.total === hybrid.total && jev.total > 0;
  let text = 'Complete a run with all three arms to compare their trade-offs. Partial runs and different sample counts are not a fair comparison.';
  if (complete) text = 'All three arms completed, but there are not enough successful observations to compare their latency. Inspect the error counts and individual cases before drawing conclusions.';
  if (unavailable.length) text = `${unavailable.map(item => ARM_LABELS[item.arm]).join(', ')} inference is unavailable: no successful final predictions were recorded. This run cannot establish a quality or latency advantage over those arms. Completed Jev decisions and actual hybrid routing remain inspectable below.`;
  if (complete && !unavailable.length && foundry.p50Ms !== null && jev.p50Ms !== null && jev.accuracy !== null && foundry.accuracy !== null) {
    const difference = (jev.accuracy - foundry.accuracy) * 100;
    const accuracyComparison = difference === 0 ? 'Jev and Foundry have the same error-inclusive accuracy. '
      : `Jev error-inclusive accuracy is ${Math.abs(difference).toFixed(1)} percentage points ${difference > 0 ? 'higher' : 'lower'}. `;
    text = `${run.options.mode === 'demo' ? 'In this synthetic example' : 'In this pilot run'}, Jev has a p50 of ${latency(jev.p50Ms)}, compared with ${latency(foundry.p50Ms)} for Foundry. `
      + accuracyComparison
      + (foundry.errors || jev.errors ? 'These scores combine availability and correctness, not model quality alone. ' : '')
      + `The hybrid escalated ${hybrid.escalated} of ${hybrid.total} observations. `
      + (run.options.mode === 'demo' ? 'These numbers demonstrate the interface, not provider performance.' : 'This small, hand-labelled sample does not establish a general model ranking.');
  }
  return <aside className="run-insight"><span className="insight-icon"><Lightbulb size={19} aria-hidden="true" /></span>
    <div><h2>A note on the trade-off</h2><p>{text}</p></div></aside>;
}
