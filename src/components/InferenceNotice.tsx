import { TriangleAlert } from 'lucide-react';
import { ARM_LABELS, type BenchmarkRun, type MetricSummary } from '../../shared/types';

export function InferenceNotice({ run, summaries }: { run: BenchmarkRun; summaries: MetricSummary[] }) {
  const unavailable = summaries.filter(item => item.total > 0 && item.successes === 0);
  if (!unavailable.length) return null;
  const conditionalAccessBlocked = run.observations.some(item =>
    item.status === 'error' && (item.arm === 'foundry' || item.escalated)
    && /\bAADSTS53003\b/.test(item.error ?? ''));
  return <aside className="inference-notice" aria-labelledby="inference-notice-title">
    <TriangleAlert size={22} aria-hidden="true" />
    <div>
      <span className="eyebrow">COMPARISON BLOCKED</span>
      <h2 id="inference-notice-title">Inference unavailable — not a quality result</h2>
      <ul>{unavailable.map(item => <li key={item.arm}><strong>{ARM_LABELS[item.arm]}:</strong> {item.errors} errors across {item.total} observations; no successful final predictions.</li>)}</ul>
      {conditionalAccessBlocked && <p><strong>Foundry authentication blocked.</strong> The recorded AADSTS53003 error indicates that Microsoft Entra Conditional Access blocked token acquisition. The model was not evaluated by those requests.</p>}
      <p>Model quality and successful-response latency are unmeasured for these arms. Their failed requests are not evidence that Jev is more accurate or faster. An error-inclusive score of zero would describe operational failure, not incorrect model decisions.</p>
    </div>
  </aside>;
}
