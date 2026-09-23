import { summarize } from '../../shared/metrics';
import { ARMS, ARM_LABELS, type BenchmarkRun } from '../../shared/types';
import { latency, percent } from '../lib/format';

export function ScenarioResults({ run }: { run: BenchmarkRun }) {
  const scenarios = run.dataset.scenarios.filter(item => run.options.scenarioIds.includes(item.id));
  return <section className="scenario-results" aria-labelledby="scenarios-title">
    <div className="report-section-heading"><span className="eyebrow">02 / WHERE QUALITY CHANGES</span><h2 id="scenarios-title">Scenario-level results</h2>
      <p>Each arm is scored against the same saved rubric. Displayed accuracy includes errors. Missing observations and all-error arms are not measured model-quality scores.</p></div>
    <div className="scenario-grid">{scenarios.map(scenario => {
      const rows = run.observations.filter(item => item.scenarioId === scenario.id);
      const cases = run.dataset.cases.filter(item => item.scenarioId === scenario.id);
      return <article className="panel scenario-report" key={scenario.id}>
        <header><span className="eyebrow">{cases.length} LABELLED CASES · {Object.keys(scenario.criteria).length} CHOICES</span><h3>{scenario.name}</h3><p>{scenario.description}</p></header>
        <div className="table-scroll" tabIndex={0} role="region" aria-label={`${scenario.name} comparison, scroll horizontally`}>
          <table><caption className="sr-only">{scenario.name}: accuracy includes errors, latency includes successes only.</caption>
            <thead><tr><th scope="col">Arm / sample</th><th scope="col">Error-inclusive accuracy</th><th scope="col">p50</th><th scope="col">p95</th></tr></thead>
            <tbody>{ARMS.map(arm => {
              const metric = summarize(rows, arm, [scenario]);
              return <tr key={arm}><th scope="row"><span className={`arm-dot ${arm}`} /> {ARM_LABELS[arm]}<small>{metric.total ? `n = ${metric.total} · ${metric.errors} errors` : 'Unmeasured'}</small></th>
                {!metric.total ? <td colSpan={3}>Unmeasured</td>
                  : !metric.successes ? <td colSpan={3} className="inference-unavailable">Inference unavailable<small>No successful predictions</small></td>
                    : <><td className="metric-emphasis">{percent(metric.accuracy)}</td><td>{latency(metric.p50Ms)}</td><td>{latency(metric.p95Ms)}</td></>}
              </tr>;
            })}</tbody>
          </table>
        </div>
      </article>;
    })}</div>
  </section>;
}
