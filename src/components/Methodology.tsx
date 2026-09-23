import { ArrowRight, BookOpen, CheckCheck, Fingerprint, ShieldCheck } from 'lucide-react';
import type { BenchmarkRun, Bootstrap } from '../../shared/types';

export function Methodology({ data, run }: { data: Bootstrap; run: BenchmarkRun | null }) {
  const dataset = run?.dataset ?? data;
  return <div className="methodology">
    <section className="panel methodology-intro"><span className="eyebrow">A SHARED YARDSTICK</span><h2>Compare approaches.<br />Keep the experiment honest.</h2>
      <p>This is a {dataset.cases.length}-case, hand-labelled synthetic pilot across {dataset.scenarios.length} decision scenarios—not a general model ranking. It tests discrete <strong>Choice</strong> decisions, not freeform generation, Score or Noul.</p>
      <div className="method-principles"><span><CheckCheck size={18} aria-hidden="true" />Identical input & rubric</span><span><Fingerprint size={18} aria-hidden="true" />Saved dataset snapshot</span><span><ShieldCheck size={18} aria-hidden="true" />No hidden retries</span></div>
    </section>
    <section className="panel" aria-labelledby="protocol-title"><div className="panel-heading"><h2 id="protocol-title">Three arms. One protocol.</h2><BookOpen size={18} aria-hidden="true" /></div>
      <div className="arm-protocols">
        <article><span className="arm-dot foundry" /><h3>Foundry LLM</h3><p>Send the original input and explicit rubric to your configured Foundry deployment. Record the discrete choice and reported token usage.</p><span className="protocol-path">Input <ArrowRight size={13} aria-hidden="true" /> Foundry <ArrowRight size={13} aria-hidden="true" /> Choice</span></article>
        <article><span className="arm-dot jev" /><h3>Jev</h3><p>Send the same input and rubric to Jev for a choice. Preserve its confidence and label probabilities when available.</p><span className="protocol-path">Input <ArrowRight size={13} aria-hidden="true" /> Jev <ArrowRight size={13} aria-hidden="true" /> Choice</span></article>
        <article><span className="arm-dot hybrid" /><h3>Foundry + Jev</h3><p>Make an independent Jev request. If confidence is below the gate, ask Foundry using the original input and rubric; otherwise retain Jev’s choice.</p><span className="protocol-path">Jev <ArrowRight size={13} aria-hidden="true" /> Confidence gate <ArrowRight size={13} aria-hidden="true" /> Foundry</span></article>
      </div>
    </section>
    <div className="method-grid">
      <section className="panel method-section"><h2>What the numbers mean</h2><dl className="method-definitions">
        <div><dt>Accuracy</dt><dd>Correct choices divided by all attempted observations. Failed requests remain in the denominator and count as incorrect.</dd></div>
        <div><dt>Macro F1</dt><dd>Calculate F1 for every rubric label in each represented scenario, then take the unweighted mean. Errors contribute missed expected labels.</dd></div>
        <div><dt>p50 / p95 latency</dt><dd>Interpolated percentiles of successful wall-clock request durations only. Hybrid duration includes both stages when escalated; error durations are excluded.</dd></div>
        <div><dt>Observed tokens & cost</dt><dd>Sum only usage actually reported by successful stages. Missing usage stays unknown. No cost estimate is fabricated; provider pricing and charges are not measured.</dd></div>
      </dl></section>
      <section className="panel method-section"><h2>Reproducibility & limitations</h2><ul className="method-list">
        <li>Seeded randomized serial execution, with no retries. A seed reproduces scheduling—not live model responses.</li>
        <li>Each arm makes independent requests. The hybrid never reuses the standalone Jev arm’s output.</li>
        <li>Actual returned model identifiers, stage durations, options and dataset snapshots are saved per run.</li>
        <li>No comparative conclusions without all three arms on the same cases. Incomplete, cancelled or interrupted runs are partial evidence.</li>
        <li>This small synthetic case suite cannot establish statistical significance or represent production traffic. Repetitions do not add independent labelled examples.</li>
        <li>Demo latencies, choices and usage are synthetic examples—not measured model performance.</li>
      </ul></section>
    </div>
    <section className="panel"><div className="panel-heading"><h2>The decision suite</h2><span className="tiny-label">{dataset.cases.length} LABELLED CASES</span></div>
      <div className="scenario-cards">{dataset.scenarios.map((scenario, index) => <article key={scenario.id}>
        <span className="scenario-index">0{index + 1}</span><h3>{scenario.name}</h3><p>{scenario.description}</p>
        <div className="label-tags">{Object.keys(scenario.criteria).map(choice => <span key={choice}>{choice}</span>)}</div>
        <small>{dataset.cases.filter(item => item.scenarioId === scenario.id).length} cases · standard + edge cases</small>
      </article>)}</div>
    </section>
    {run && <section className="panel method-section"><h2>Selected run provenance</h2><dl className="provenance">
      <div><dt>Run identifier</dt><dd>{run.id}</dd></div><div><dt>Dataset / protocol</dt><dd>{run.datasetVersion} / {run.protocol.version}</dd></div>
      <div><dt>Dataset hash</dt><dd><code>{run.datasetHash}</code></dd></div>
      <div><dt>Seed / confidence gate</dt><dd>{run.options.seed} / {run.options.threshold.toFixed(2)}</dd></div>
      <div><dt>Configured Foundry / Jev</dt><dd>{run.models.foundry} / {run.models.jev}</dd></div>
      <div><dt>Execution limits</dt><dd>{run.protocol.stageTimeoutMs.toLocaleString()} ms per stage · {run.protocol.maxCompletionTokens} max completion tokens · {run.protocol.retries} retries</dd></div>
    </dl><p className="field-help">Inspect individual case stages for actual returned model identifiers; these can differ from configured deployment names.</p></section>}
  </div>;
}
