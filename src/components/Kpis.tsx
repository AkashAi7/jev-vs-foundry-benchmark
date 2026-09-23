import { ArrowDownUp, CheckCheck, CircleDollarSign, Layers3 } from 'lucide-react';
import type { BenchmarkRun, MetricSummary } from '../../shared/types';
import { count, latency } from '../lib/format';

export function Kpis({ run, summaries }: { run: BenchmarkRun | null; summaries: MetricSummary[] }) {
  const successful = summaries.reduce((sum, item) => sum + item.successes, 0);
  const errors = summaries.reduce((sum, item) => sum + item.errors, 0);
  const medianValues = summaries.flatMap(summary => summary.p50Ms === null ? [] : [summary.p50Ms]);
  const medianRange = medianValues.length ? `${latency(Math.min(...medianValues))} – ${latency(Math.max(...medianValues))}` : '—';
  return <section className="kpi-grid" aria-label="Run at a glance">
    <article className="kpi"><span className="kpi-label">Observations<Layers3 size={16} aria-hidden="true" /></span>
      <strong>{run ? count(run.observations.length) : '—'}{run && <small> / {count(run.total)}</small>}</strong>
      <span>{run ? `${run.options.arms.length} arms · ${run.options.repetitions} ${run.options.repetitions === 1 ? 'repetition' : 'repetitions'}` : 'Your run will appear here'}</span>
    </article>
    <article className="kpi"><span className="kpi-label">Successful responses<CheckCheck size={16} aria-hidden="true" /></span>
      <strong>{run ? count(successful) : '—'}<small>{run ? ` / ${count(run.observations.length)}` : ''}</small></strong>
      <span>{run ? `${errors} ${errors === 1 ? 'error' : 'errors'} · correctness scored separately` : 'Errors stay in the denominator'}</span>
    </article>
    <article className="kpi"><span className="kpi-label">Arm p50 range<ArrowDownUp size={16} aria-hidden="true" /></span>
      <strong className="kpi-latency">{medianRange}</strong>
      <span>{run?.options.mode === 'demo' ? 'Illustrative latencies only' : 'Successful observations only'}</span>
    </article>
    <article className="kpi"><span className="kpi-label">Provider cost<CircleDollarSign size={16} aria-hidden="true" /></span>
      <strong className="kpi-cost">Not measured</strong>
      <span>No pricing assumptions applied</span>
    </article>
  </section>;
}
