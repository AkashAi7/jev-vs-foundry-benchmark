import { useState } from 'react';
import { ArrowUpRight, Filter, Search, X } from 'lucide-react';
import { ARM_LABELS, type BenchmarkCase, type BenchmarkRun, type Bootstrap, type Observation } from '../../shared/types';
import { latency } from '../lib/format';
import { CaseDetail } from './CaseDetail';

type CaseRow = { item: BenchmarkCase; observation: Observation | null };
export function Cases({ data, run }: { data: Bootstrap; run: BenchmarkRun | null }) {
  const [scenario, setScenario] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<CaseRow | null>(null);
  const dataset = run?.dataset ?? data;
  const rows: CaseRow[] = run
    ? run.observations.flatMap(observation => {
      const item = dataset.cases.find(value => value.id === observation.caseId);
      return item ? [{ item, observation }] : [];
    })
    : dataset.cases.map(item => ({ item, observation: null }));
  const filtered = rows.filter(({ item, observation }) => {
    const matchesSearch = `${item.id} ${item.title} ${item.input}`.toLowerCase().includes(search.toLowerCase().trim());
    const matchesOutcome = outcome === 'all'
      || (outcome === 'correct' && observation?.correct && observation.status === 'success')
      || (outcome === 'incorrect' && observation?.status === 'success' && !observation.correct)
      || (outcome === 'error' && observation?.status === 'error')
      || (outcome === 'escalated' && observation?.escalated);
    return matchesSearch && matchesOutcome && (scenario === 'all' || item.scenarioId === scenario);
  });
  const reset = () => { setScenario('all'); setOutcome('all'); setSearch(''); };
  return <>
    <section className="panel cases-panel" aria-labelledby="cases-title">
      <div className="panel-heading"><div><span className="eyebrow">THE EVIDENCE, NOT JUST THE AVERAGE</span><h2 id="cases-title">{run ? 'Decision-level results' : 'Explore the case library'}</h2></div>
        <span className="chart-tag">{filtered.length} {run ? 'observations' : 'cases'}</span></div>
      {!run && <p className="case-library-note">Browse the {dataset.cases.length} built-in synthetic cases and their rubrics. Predictions appear only after you run a benchmark.</p>}
      <div className="case-filters">
        <label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Search cases</span>
          <input type="search" placeholder="Search cases…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label><span className="sr-only">Filter by scenario</span><select value={scenario} onChange={event => setScenario(event.target.value)}>
          <option value="all">All scenarios</option>{dataset.scenarios.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label><span className="sr-only">Filter by outcome</span><select value={outcome} disabled={!run} onChange={event => setOutcome(event.target.value)}>
          <option value="all">All outcomes</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option>
          <option value="error">Errors</option><option value="escalated">Escalated</option>
        </select></label>
        {(search || scenario !== 'all' || outcome !== 'all') && <button className="text-button" onClick={reset}><X size={14} aria-hidden="true" />Reset</button>}
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Case results table, scroll horizontally for all columns">
        <table className="cases-table"><caption className="sr-only">{run ? 'Selected run observations' : 'Built-in synthetic dataset'}</caption>
          <thead><tr><th scope="col">Case</th><th scope="col">Scenario</th><th scope="col">Arm</th><th scope="col">Expected / predicted</th><th scope="col">Latency</th><th scope="col">Outcome</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.observation?.id ?? row.item.id}>
            <th scope="row"><span className="case-id">{row.item.id}{row.item.difficulty === 'edge' && <span className="edge-tag">EDGE</span>}</span>
              {row.item.title}{row.observation && <small>Repetition {row.observation.repetition}</small>}</th>
            <td>{dataset.scenarios.find(item => item.id === row.item.scenarioId)?.name ?? row.item.scenarioId}</td>
            <td>{row.observation ? <span className="arm-cell"><span className={`arm-dot ${row.observation.arm}`} />{ARM_LABELS[row.observation.arm]}</span> : 'Not run'}</td>
            <td><span className="choice-value">{row.item.expected}</span><small>{row.observation?.predicted ?? '—'}</small></td>
            <td>{row.observation ? latency(row.observation.latencyMs) : '—'}</td>
            <td><Outcome observation={row.observation} />{row.observation?.escalated && <small>Escalated to Foundry</small>}</td>
            <td><button className="inspect-button" onClick={() => setDetail(row)}
              aria-label={`Inspect ${row.item.title}${row.observation ? `, ${ARM_LABELS[row.observation.arm]}, repetition ${row.observation.repetition}` : ''}`}><ArrowUpRight size={17} aria-hidden="true" /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length && <div className="table-empty" role="status"><Filter size={24} aria-hidden="true" /><h3>No matching observations</h3>
        <p>{run?.status === 'running' ? 'The run is still in progress. Observations will appear as they finish.' : 'Try a different filter, or start a benchmark from Overview.'}</p>
        <button className="secondary-button" onClick={reset}>Reset filters</button></div>}
      <div className="table-notes"><p>Inspect any row to view the original input, shared rubric and full provider-stage trace. Individual error latencies are shown here but excluded from latency aggregates.</p></div>
    </section>
    {detail && <CaseDetail item={detail.item} observation={detail.observation}
      scenario={dataset.scenarios.find(item => item.id === detail.item.scenarioId)} close={() => setDetail(null)} />}
  </>;
}

function Outcome({ observation }: { observation: Observation | null }) {
  const outcome = !observation ? 'Not run' : observation.status === 'error' ? 'Error' : observation.correct ? 'Correct' : 'Incorrect';
  return <span className={`outcome outcome-${outcome.toLowerCase().replace(' ', '-')}`}>{outcome}</span>;
}
