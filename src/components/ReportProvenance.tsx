import type { BenchmarkRun } from '../../shared/types';
import { count, dateTime } from '../lib/format';

export function ReportProvenance({ run }: { run: BenchmarkRun }) {
  const cases = run.dataset.cases.filter(item => run.options.scenarioIds.includes(item.scenarioId));
  const observedCases = new Set(run.observations.map(item => item.caseId)).size;
  const actualModels = [...new Set(run.observations.flatMap(row => row.stages.map(stage => `${stage.provider}: ${stage.model}`)))];
  return <section className={`panel report-provenance ${run.options.mode === 'demo' ? 'is-fixture' : ''}`} aria-labelledby="provenance-title">
    <div className="report-lead">
      <div><span className="eyebrow">{run.options.mode === 'live' ? 'LIVE PROVIDER MEASUREMENTS / SYNTHETIC LABELLED INPUTS' : 'SYNTHETIC FIXTURE / NOT PROVIDER MEASUREMENTS'}</span>
        <h2 id="provenance-title">{run.status === 'completed' ? 'The recorded result' : 'An incomplete record'}</h2>
        <p>{run.status === 'completed' ? 'Read quality, latency and routing together. No single score establishes a model ranking.' : 'These observations are provisional. Missing calls and arms cannot support a comparative conclusion.'}</p>
      </div>
      <div className="sample-stamp"><strong>{count(cases.length)}</strong><span>independent labelled cases</span><small>{observedCases} represented so far</small></div>
    </div>
    <dl className="report-facts">
      <div><dt>Foundry deployment</dt><dd>{run.models.foundry}</dd></div>
      <div><dt>Jev model</dt><dd>{run.models.jev}</dd></div>
      <div><dt>Sampling</dt><dd>{run.options.arms.length} arms × {run.options.repetitions} repetitions<small>{run.observations.length} / {run.total} observations recorded</small></dd></div>
      <div><dt>Recorded protocol</dt><dd>{run.protocol.version}<small>Seed {run.options.seed} · gate {run.options.threshold.toFixed(2)}</small></dd></div>
    </dl>
    <details className="report-audit"><summary>Provenance & reproducibility</summary>
      <dl className="audit-list">
        <div><dt>Run ID / status</dt><dd><code>{run.id}</code> · {run.status}</dd></div>
        <div><dt>Timestamps</dt><dd>Started {dateTime(run.createdAt)}{run.completedAt ? ` · Finished ${dateTime(run.completedAt)}` : ' · Not finished'}</dd></div>
        <div><dt>Dataset snapshot</dt><dd>{run.datasetVersion}<small><code>SHA-256 {run.datasetHash}</code></small></dd></div>
        <div><dt>Execution</dt><dd>Serial, seeded order · {run.protocol.retries} retries · {run.protocol.stageTimeoutMs.toLocaleString()} ms stage timeout · {run.protocol.maxCompletionTokens} completion-token limit</dd></div>
        <div><dt>Foundry authentication</dt><dd>{run.protocol.foundryAuth === undefined ? 'Not recorded in this historical report' : run.protocol.foundryAuth === null ? 'Not used for this run' : run.protocol.foundryAuth === 'vscode' ? 'VS Code developer / Microsoft Entra user' : 'Microsoft Entra service principal'}<small>Authentication mode is not proof of successful sign-in or inference.</small></dd></div>
        <div><dt>Stage-reported models</dt><dd>{actualModels.length ? actualModels.join(' · ') : 'No completed provider stages'}</dd></div>
      </dl>
      <p>All views use this run’s saved cases and rubrics, not the current dataset. Repetitions test repeatability; they do not add independent cases. Provider settings alone are not evidence of successful inference.</p>
    </details>
  </section>;
}
