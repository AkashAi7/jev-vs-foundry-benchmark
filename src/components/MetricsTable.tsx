import { ARM_LABELS, type BenchmarkRun, type MetricSummary } from '../../shared/types';
import { latency, percent, tokens } from '../lib/format';

export function MetricsTable({ run, summaries }: { run: BenchmarkRun; summaries: MetricSummary[] }) {
  return <section className="panel metrics-panel" aria-labelledby="metrics-title">
    <div className="panel-heading"><div><span className="eyebrow">SIDE BY SIDE</span><h2 id="metrics-title">Every arm, on the same terms</h2></div>
      <span className="tiny-label">{run.observations.length} OBSERVATIONS</span></div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Comparison metrics, scroll horizontally for all columns">
      <table className="metrics-table">
        <caption className="sr-only">Arm comparison. Null metrics are not measured. All-error arms are inference unavailable, not measured model-quality failures. {run.options.mode === 'demo' ? 'Synthetic example, not measured model performance.' : 'Live provider observations.'}</caption>
        <thead><tr><th scope="col">Comparison arm</th><th scope="col">Error-inclusive accuracy</th><th scope="col">Macro F1</th><th scope="col">p50 latency</th><th scope="col">p95 latency</th><th scope="col">Errors</th><th scope="col">Observed tokens</th></tr></thead>
        <tbody>{summaries.map(item => <tr key={item.arm}>
          <th scope="row"><span className={`arm-dot ${item.arm}`} />{ARM_LABELS[item.arm]}<small>{item.total ? `${item.total} observations` : 'Unmeasured'}</small></th>
          {!item.total ? <td colSpan={6}>Unmeasured — no observations for this arm</td>
            : !item.successes ? <><td colSpan={4} className="inference-unavailable">Inference unavailable<small>No successful predictions; quality and latency unmeasured</small></td><td>{item.errors} / {item.total}</td><td>{tokens(item)}</td></>
            : <><td className="metric-emphasis">{percent(item.accuracy)}</td><td>{item.macroF1?.toFixed(3) ?? '—'}</td>
              <td>{latency(item.p50Ms)}</td><td>{latency(item.p95Ms)}</td><td>{item.errors} / {item.total}</td><td>{tokens(item)}</td></>}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="table-notes"><p><strong>Read with care.</strong> Displayed accuracy and macro F1 include errors, so they combine availability with correctness. All-error arms are withheld from quality comparisons. Macro F1 gives equal weight to the rubric labels within represented scenarios. Tokens sum reported stage usage; partial means some usage is unknown.</p>
      <p>Cost, network-only latency and general model capability are not measured.</p></div>
  </section>;
}
