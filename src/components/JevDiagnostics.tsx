import { summarizeJev } from '../../shared/jev-report';
import type { BenchmarkRun } from '../../shared/types';
import { latency, percent } from '../lib/format';

export function JevDiagnostics({ run }: { run: BenchmarkRun }) {
  const report = summarizeJev(run);
  return <details className="panel jev-diagnostics">
    <summary>Standalone Jev diagnostics — confusion, difficulty & repeat consistency</summary>
    <p className="panel-intro">These diagnostics reuse the saved report's standalone Jev observations only. Hybrid calls are excluded. Zero cell counts describe observations, not performance on unseen cases.</p>
    {!report.summary.total ? <p className="panel-intro">Standalone Jev is unmeasured in this report.</p> : <>
      <div className="diagnostic-summary">
        <div><strong>{report.casesEvaluated} / {report.casesPlanned}</strong><span>independent cases observed / planned</span></div>
        <div><strong>{percent(report.repeats.agreement)}</strong><span>repeat-choice consistency</span></div>
        <div><strong>{report.repeats.eligibleCases}</strong><span>cases with all repeated calls successful</span></div>
      </div>
      <p className="chart-footnote">{run.options.repetitions < 2
        ? 'Repeat consistency is unmeasured: this run requested one call per case.'
        : `${report.repeats.consistentCases} of ${report.repeats.eligibleCases} eligible cases returned the same choice every time; ${report.repeats.pendingCases} cases lack a complete successful repeat set. A consistently repeated choice can still be wrong.`}</p>
      <section aria-labelledby="difficulty-title">
        <h3 id="difficulty-title">Standard versus edge cases</h3>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Jev difficulty breakdown, scroll horizontally">
          <table><caption className="sr-only">Standalone Jev accuracy includes errors; latency includes successful responses only.</caption>
            <thead><tr><th scope="col">Case difficulty</th><th scope="col">Observations</th><th scope="col">Accuracy</th><th scope="col">Errors</th><th scope="col">p50 latency</th></tr></thead>
            <tbody>{report.difficulties.map(({ difficulty, summary }) => <tr key={difficulty}>
              <th scope="row">{difficulty === 'edge' ? 'Edge cases' : 'Standard cases'}</th>
              <td>{summary.total}</td>{summary.total
                ? <><td>{percent(summary.accuracy)}</td><td>{summary.errors}</td><td>{latency(summary.p50Ms)}</td></>
                : <td colSpan={3}>Unmeasured</td>}
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="confusion-title">
        <h3 id="confusion-title">Which labels did Jev confuse?</h3>
        <p className="panel-intro">Rows are expected labels; columns are Jev predictions. Diagonal cells are correct. Provider errors have a separate column and remain incorrect in accuracy.</p>
        <div className="confusion-grid">{report.scenarios.map(({ scenario, summary, confusion }) =>
          <article key={scenario.id} className="confusion-scenario">
            <h4>{scenario.name} <span>n = {summary.total}</span></h4>
            {summary.total ? <div className="table-scroll" tabIndex={0} role="region" aria-label={`${scenario.name} Jev confusion matrix, scroll horizontally`}>
              <table><caption className="sr-only">{scenario.name}: expected labels by predicted labels, with provider errors reported separately.</caption>
                <thead><tr><th scope="col">Expected ↓ / predicted →</th>{confusion.labels.map(label => <th scope="col" key={label}>{label}</th>)}<th scope="col">Error</th></tr></thead>
                <tbody>{confusion.labels.map((expected, row) => <tr key={expected}>
                  <th scope="row">{expected}</th>{confusion.labels.map((predicted, column) =>
                    <td key={predicted} className={row === column ? 'confusion-correct' : confusion.cells[row]?.[column] ? 'confusion-mistake' : ''}>{confusion.cells[row]?.[column] ?? 0}</td>)}
                  <td>{confusion.errors[row] ?? 0}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="panel-intro">Unmeasured</p>}
          </article>)}</div>
      </section>
    </>}
  </details>;
}
