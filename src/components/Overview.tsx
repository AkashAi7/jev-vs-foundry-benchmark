import { ArrowUpRight } from 'lucide-react';
import type { BenchmarkRun, Bootstrap, MetricSummary, RunOptions } from '../../shared/types';
import { ComparisonCharts } from './ComparisonCharts';
import { EmptyResults } from './Status';
import { Kpis } from './Kpis';
import { MetricsTable } from './MetricsTable';
import { RunControls } from './RunControls';
import { RunInsight } from './RunInsight';
import { ReportProvenance } from './ReportProvenance';
import { ScenarioResults } from './ScenarioResults';
import { JevAnalysis } from './JevAnalysis';
import { InferenceNotice } from './InferenceNotice';

export function Overview({ data, run, summaries, options, setOptions, busy, start, example, showCases }: {
  data: Bootstrap; run: BenchmarkRun | null; summaries: MetricSummary[]; options: RunOptions;
  setOptions: (options: RunOptions) => void; busy: boolean; start: () => void; example: () => void; showCases: () => void;
}) {
  return <div className="report-view">
    {run ? <>
      <ReportProvenance run={run} />
      <InferenceNotice run={run} summaries={summaries} />
      <div className="report-section-heading"><span className="eyebrow">01 / COMPARATIVE RESULTS</span><h2>Three arms. One saved protocol.</h2>
        <p>Displayed accuracy includes failed observations and is an operational result, not pure model quality. Arms with no successful inference are marked unavailable. Latency summarizes successful responses, including both stages when the hybrid escalates.</p></div>
      <Kpis run={run} summaries={summaries} />
      <ComparisonCharts summaries={summaries} demo={run.options.mode === 'demo'} />
      <MetricsTable run={run} summaries={summaries} />
      <RunInsight run={run} summaries={summaries} />
      <ScenarioResults run={run} />
      <JevAnalysis key={run.id} run={run} />
      <div className="results-link"><span>Inspect the inputs, rubric and provider stages behind each result.</span><button className="text-button" onClick={showCases}>Inspect cases & results <ArrowUpRight size={16} aria-hidden="true" /></button></div>
    </> : <section className="panel"><EmptyResults loadExample={example} busy={busy || data.runs.some(item => item.status === 'running')} /></section>}
    <details className="run-setup">
      <summary><span>Collect another report</span><small>Run setup · live providers by default · requests may incur cost</small></summary>
      <RunControls options={options} setOptions={setOptions} scenarios={data.scenarios} cases={data.cases}
        config={data.config} busy={busy} active={data.runs.some(item => item.status === 'running')} start={start} />
    </details>
  </div>;
}
