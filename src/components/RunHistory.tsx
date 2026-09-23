import { Check, Clock3, Download, RefreshCw, Square } from 'lucide-react';
import type { BenchmarkRun } from '../../shared/types';
import { dateTime } from '../lib/format';

export function RunHistory({ runs, run, select, cancel, refresh, busy }: {
  runs: BenchmarkRun[]; run: BenchmarkRun | null; select: (id: string) => void;
  cancel: () => void; refresh: () => void; busy: boolean;
}) {
  const otherActiveRun = runs.find(item => item.status === 'running' && item.id !== run?.id);
  return <section className="run-history" aria-label="Run history and exports">
    <label><Clock3 size={16} aria-hidden="true" /><span className="sr-only">Select a benchmark run</span>
      <select value={run?.id ?? ''} onChange={event => select(event.target.value)}>
        <option value="" disabled>{runs.length ? 'Select a report · synthetic fixtures are opt-in' : 'No saved reports'}</option>
        {runs.map((item, index) => <option key={item.id} value={item.id}>
          {index === 0 ? 'Latest · ' : ''}{dateTime(item.createdAt)} · {item.options.mode === 'demo' ? 'SYNTHETIC FIXTURE' : 'LIVE'} · {item.status} · {item.id.slice(-6)}
        </option>)}
      </select>
    </label>
    <button className="text-button" onClick={refresh} disabled={busy}><RefreshCw size={14} aria-hidden="true" />Refresh reports</button>
    {run && <div className="run-history-actions">
      <span className={`run-state ${run.status}`}>{run.status === 'completed' && <Check size={14} aria-hidden="true" />}{run.status}</span>
      <span className="observation-count">{run.observations.length}/{run.total} observations</span>
      <a className="export-link" href={`/api/runs/${encodeURIComponent(run.id)}/export?format=json`} download aria-label="Download selected run as JSON"><Download size={14} aria-hidden="true" />JSON</a>
      <a className="export-link" href={`/api/runs/${encodeURIComponent(run.id)}/export?format=csv`} download aria-label="Download selected run as CSV"><Download size={14} aria-hidden="true" />CSV</a>
    </div>}
    {run?.status === 'running' && <div className="run-progress">
      <progress value={run.observations.length} max={Math.max(run.total, 1)} aria-label="Benchmark progress" />
      <span role="status" aria-live="polite">{run.observations.length} complete · {Math.max(0, run.total - run.observations.length)} pending</span>
      <button className="text-button" onClick={cancel} disabled={busy}><Square size={13} aria-hidden="true" />Cancel run</button>
    </div>}
    {otherActiveRun && <div className="run-progress"><span>Another run may still be executing. Select it to refresh its status.</span>
      <button className="text-button" onClick={() => select(otherActiveRun.id)}>View active run</button></div>}
  </section>;
}
