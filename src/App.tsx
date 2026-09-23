import { useMemo, useRef, useState } from 'react';
import { ChevronRight, FlaskConical } from 'lucide-react';
import { summarize } from '../shared/metrics';
import { DATASET_VERSION, scenarios } from '../shared/scenarios';
import { ARMS, type RunOptions } from '../shared/types';
import { Sidebar, type Page } from './components/Sidebar';
import { Overview } from './components/Overview';
import { Cases } from './components/Cases';
import { Connections } from './components/Connections';
import { Methodology } from './components/Methodology';
import { JevConverter } from './components/JevConverter';
import { RunHistory } from './components/RunHistory';
import { DemoNotice, ErrorNotice, LoadingWorkspace } from './components/Status';
import { useBenchmark } from './hooks/useBenchmark';

const defaultOptions = (): RunOptions => ({
  mode: 'live', arms: [...ARMS], scenarioIds: scenarios.map(scenario => scenario.id), repetitions: 1, threshold: 0.8, seed: 42,
});
const pages: Record<Page, { title: string; subtitle: string; eyebrow: string }> = {
  overview: { title: 'Decision benchmark report', subtitle: 'Foundry vs Jev vs a confidence-gated hybrid. Measured outcomes, inspectable decisions.', eyebrow: 'EVIDENCE / QUALITY / ROUTING' },
  cases: { title: 'Look closer at every choice.', subtitle: 'Follow the evidence from original input to the final decision.', eyebrow: 'CASES & RESULTS' },
  converter: { title: 'Turn an LLM into a decision engine.', subtitle: 'Wrap Foundry or local models with fixed-choice next-token scoring.', eyebrow: 'JEV-STYLE CONVERTER' },
  methodology: { title: 'A fair test starts with the rules.', subtitle: 'A transparent, reproducible pilot for discrete decision-making.', eyebrow: 'METHODOLOGY' },
  connections: { title: 'Provider configuration', subtitle: 'Existing deployments and server-side credentials. Configuration is not verification.', eyebrow: 'CONNECTIONS' },
};

export function App() {
  const benchmark = useBenchmark();
  const [page, setPage] = useState<Page>('overview');
  const [options, setOptions] = useState<RunOptions>(defaultOptions);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { data, selected: run } = benchmark;
  const summaries = useMemo(() => {
    if (!run) return [];
    const selectedScenarios = run.dataset.scenarios.filter(scenario => run.options.scenarioIds.includes(scenario.id));
    return ARMS.map(arm => summarize(run.observations, arm, selectedScenarios));
  }, [run]);
  const navigate = (next: Page) => {
    setPage(next);
    requestAnimationFrame(() => titleRef.current?.focus());
  };
  const example = () => {
    const demo: RunOptions = { ...defaultOptions(), mode: 'demo', scenarioIds: data?.scenarios.map(item => item.id) ?? defaultOptions().scenarioIds };
    void benchmark.start(demo);
  };
  const mode = run?.options.mode ?? options.mode;
  const showResults = page === 'overview' || page === 'cases';
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <Sidebar page={page} navigate={navigate} {...(data ? { config: data.config } : {})} />
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} aria-hidden="true" /><strong>Benchmark Lab</strong></div>
        <div className="dataset-meta"><span className="dataset-name">{run?.datasetVersion ?? DATASET_VERSION}</span><span className={`badge badge-${mode}`}><span />{mode === 'demo' ? 'SYNTHETIC' : run ? 'LIVE RUN' : 'NO REPORT'}</span></div>
      </header>
      <main id="main" className="main-content" tabIndex={-1}>
        <div className="page-heading"><div><span className="eyebrow">{pages[page].eyebrow}</span><h1 ref={titleRef} tabIndex={-1}>{pages[page].title}</h1><p>{pages[page].subtitle}</p></div>
          <span className="pilot-badge"><FlaskConical size={15} aria-hidden="true" />Decision suite<span>v1</span></span></div>
        {benchmark.loading ? <LoadingWorkspace /> : !data ? <section className="panel bootstrap-error"><h2>Unable to load the workspace</h2><ErrorNotice message={benchmark.error ?? 'The server is unavailable.'} retry={benchmark.reload} /></section> : <>
          {benchmark.error && <ErrorNotice message={benchmark.error} dismiss={benchmark.dismissError} />}
          {showResults && <>
            {(run?.options.mode === 'demo' || (!run && options.mode === 'demo')) && <DemoNotice />}
            <RunHistory runs={data.runs} run={run} select={benchmark.setSelectedId} cancel={() => { void benchmark.cancel(); }} refresh={benchmark.reload} busy={benchmark.busy} />
            {benchmark.pollError && <ErrorNotice message={`Live updates paused: ${benchmark.pollError} The run may still be executing on the server. Retry to refresh its status.`} retry={benchmark.retryPoll} />}
            {run?.fatalError && <ErrorNotice message={`Run ${run.status}: ${run.fatalError}`} />}
            {run && ['cancelled', 'interrupted', 'failed'].includes(run.status) && <p className="partial-notice" role="status">This run is {run.status}. {run.observations.length} of {run.total} observations are available; results are incomplete.</p>}
          </>}
          {page === 'overview' && <Overview data={data} run={run} summaries={summaries} options={options} setOptions={setOptions}
            busy={benchmark.busy} start={() => { void benchmark.start(options); }} example={example} showCases={() => navigate('cases')} />}
          {page === 'cases' && <Cases key={run?.id ?? 'library'} data={data} run={run} />}
          {page === 'converter' && <JevConverter token={data.config.csrfToken} />}
          {page === 'methodology' && <Methodology data={data} run={run} />}
          {page === 'connections' && <Connections config={data.config} save={benchmark.configure} />}
        </>}
        <footer className="workspace-footer"><span><span className="footer-mark" aria-hidden="true">j.</span>Jev Benchmark Lab</span><span>Make the trade-offs visible. Keep the claims honest.</span></footer>
      </main>
    </div>
  </div>;
}
