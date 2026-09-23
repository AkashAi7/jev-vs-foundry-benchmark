import { AlertCircle, FlaskConical, RotateCcw } from 'lucide-react';

export function ErrorNotice({ message, retry, dismiss }: {
  message: string; retry?: () => void; dismiss?: () => void;
}) {
  return <div className="error-notice" role="alert">
    <AlertCircle size={18} aria-hidden="true" /><p>{message}</p>
    {retry && <button className="text-button" onClick={retry}><RotateCcw size={14} aria-hidden="true" />Retry</button>}
    {dismiss && <button className="text-button" onClick={dismiss}>Dismiss</button>}
  </div>;
}

export function DemoNotice() {
  return <div className="demo-notice"><FlaskConical size={17} aria-hidden="true" />
    <div><strong>Synthetic example - not measured model performance</strong>
      <span>Choices, latency and usage are fixtures. Do not use them to infer a provider advantage.</span></div>
    <span className="badge badge-demo">FIXTURE DATA</span>
  </div>;
}

export function EmptyResults({ loadExample, busy }: { loadExample: () => void; busy: boolean }) {
  return <div className="report-empty">
    <span className="eyebrow">NO MEASURED REPORT SELECTED</span>
    <h2>Evidence before a conclusion.</h2>
    <p>Select a saved live report above, or expand the run setup below to collect provider observations. Until both arms are measured, speed and quality advantages remain unknown.</p>
    <div className="unmeasured-arms"><span>Foundry <strong>Unmeasured</strong></span><span>Jev <strong>Unmeasured</strong></span><span>Hybrid <strong>Unmeasured</strong></span></div>
    <details className="fixture-opt-in"><summary>Optional: inspect a synthetic fixture</summary>
      <p>Generated choices, latency and token counts show how the report works. No provider calls are made, and these numbers are not evidence.</p>
      <button className="secondary-button" onClick={loadExample} disabled={busy}><FlaskConical size={16} aria-hidden="true" />Generate synthetic fixture</button>
    </details>
  </div>;
}

export function LoadingWorkspace() {
  return <div className="loading-workspace" aria-busy="true" role="status">
    <p>Loading your benchmark workspace…</p>
    <div className="skeleton skeleton-title" />
    <div className="kpi-grid">{[1, 2, 3, 4].map(value => <div className="skeleton skeleton-card" key={value} />)}</div>
    <div className="skeleton skeleton-chart" />
  </div>;
}
