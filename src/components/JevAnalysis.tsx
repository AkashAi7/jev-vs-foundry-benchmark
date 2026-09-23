import { useState } from 'react';
import { analyzeJev } from '../../shared/insights';
import type { BenchmarkRun } from '../../shared/types';
import { latency, percent } from '../lib/format';
import { JevDiagnostics } from './JevDiagnostics';

export function JevAnalysis({ run }: { run: BenchmarkRun }) {
  const [arm, setArm] = useState<'jev' | 'hybrid'>(run.options.arms.includes('jev') ? 'jev' : 'hybrid');
  const [selectedId, setSelectedId] = useState('');
  const analysis = analyzeJev(run.observations, run.options.threshold, arm);
  const rows = run.observations.filter(row => row.arm === arm);
  const traced = rows.filter(row => row.stages.some(stage => stage.provider === 'jev'));
  const observation = traced.find(row => row.id === selectedId) ?? traced[0];
  const stage = observation?.stages.find(item => item.provider === 'jev');
  const benchmarkCase = run.dataset.cases.find(item => item.id === observation?.caseId);
  const scenario = run.dataset.scenarios.find(item => item.id === observation?.scenarioId);
  const errors = rows.filter(row => row.stages.some(item => item.provider === 'jev' && item.confidence !== null
    && item.confidence >= run.options.threshold && item.choice !== row.expected));
  const hybrid = analysis.hybrid;
  return <section className="jev-analysis" aria-labelledby="jev-analysis-title">
    <div className="report-section-heading"><span className="eyebrow">03 / INSIDE THE DECISION</span><h2 id="jev-analysis-title">How Jev decides — and when the gate helps</h2>
      <p>Jev scores a finite set of rubric-defined choices. Confidence is a model score, not a guarantee that its choice is correct.</p></div>
    <div className="analysis-toolbar"><fieldset><legend>Inspect an independent Jev call population</legend>
      <div className="analysis-arm-options">{(['jev', 'hybrid'] as const).map(value => <label key={value} className={arm === value ? 'selected' : ''}>
        <input type="radio" name="analysis-arm" checked={arm === value} onChange={() => { setArm(value); setSelectedId(''); }} />
        {value === 'jev' ? 'Standalone Jev' : 'Jev inside hybrid'}
      </label>)}</div></fieldset>
      <p>These arms make separate Jev requests. Their confidence samples are never pooled.</p>
    </div>
    <section className="panel decision-mechanism" aria-labelledby="mechanism-title">
      <div className="panel-heading"><div><span className="eyebrow">STATE → RUBRIC → CHOICE → GATE</span><h3 id="mechanism-title">An inspectable decision path</h3></div>
        <span className="chart-tag">{run.options.mode === 'live' ? 'Recorded stages' : 'Synthetic stages'}</span></div>
      {traced.length > 0 && <label className="trace-picker">Recorded observation
        <select value={observation?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>
          {traced.map(row => <option key={row.id} value={row.id}>{row.caseId} · repetition {row.repetition} · {row.status === 'error' ? 'final error' : row.correct ? 'final correct' : 'final incorrect'}</option>)}
        </select></label>}
      <ol className="mechanism-steps">
        <li><span className="step-index">01 / STATE</span><h4>The decision input</h4>
          {benchmarkCase ? <><strong>{benchmarkCase.title}</strong><blockquote>{benchmarkCase.input}</blockquote></> : <p>The saved case supplies the state. No completed Jev stage is available for this arm.</p>}
        </li>
        <li><span className="step-index">02 / RUBRIC</span><h4>A finite set of choices</h4>
          {scenario ? <><p>{scenario.instructions}</p><dl className="choice-rubric">{Object.entries(scenario.criteria).map(([choice, rubric]) =>
            <div key={choice}><dt>{choice}</dt><dd>{rubric}</dd></div>)}</dl></> : <p>Each named choice has a criterion. Jev evaluates the same instructions and rubric that Foundry receives.</p>}
        </li>
        <li><span className="step-index">03 / JEV</span><h4>Choice & confidence</h4>
          {stage ? <><div className="decision-choice"><strong>{stage.choice}</strong><span>{percent(stage.confidence)} confidence</span></div>
            {stage.probabilities ? <ul className="probability-list">{Object.entries(stage.probabilities).map(([choice, probability]) =>
              <li key={choice}><span>{choice}</span><strong>{percent(probability)}</strong><div aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, probability)) * 100}%` }} /></div></li>)}</ul> : <p>Probabilities not reported.</p>}
            <p className="stage-caption">{stage.model} · {latency(stage.latencyMs)}</p></> : <p>Choice, probabilities and confidence appear only when a provider stage completes. No scores are assumed.</p>}
        </li>
        <li><span className="step-index">04 / GATE</span><h4>Accept or ask Foundry</h4>
          <p>Confidence ≥ {run.options.threshold.toFixed(2)}: retain Jev. Below the gate: request Foundry.</p>
          {observation && stage ? <><strong className="gate-decision">{arm === 'jev' ? 'Standalone: no gate applied' : observation.escalated ? 'Actually escalated to Foundry' : 'No escalation recorded'}</strong>
            <dl className="gate-outcome"><div><dt>Expected label</dt><dd>{observation.expected}</dd></div><div><dt>Jev stage</dt><dd>{stage.choice === observation.expected ? 'Correct' : 'Incorrect'}</dd></div>
              <div><dt>Final outcome</dt><dd>{observation.status === 'error' ? 'Provider error' : `${observation.predicted} · ${observation.correct ? 'correct' : 'incorrect'}`}</dd></div></dl>
            {arm === 'jev' && <p>No hybrid outcome can be inferred from this standalone call.</p>}
          </> : <p>Only the hybrid arm executes the gate. It retains the actual Jev and Foundry stages for inspection.</p>}
        </li>
      </ol>
    </section>
    <div className="analysis-summary" aria-label="Confidence sample accounting">
      <div><strong>{analysis.samples}</strong><span>completed confidence samples</span></div>
      <div><strong>{analysis.unavailable}</strong><span>observations without confidence</span></div>
      <div><strong>{analysis.accepted}</strong><span>at or above saved gate</span></div>
      <div><strong>{percent(analysis.acceptedAccuracy)}</strong><span>Jev correctness above gate</span></div>
    </div>
    <div className="analysis-grid">
      <section className="panel calibration-panel" aria-labelledby="calibration-title">
        <div className="panel-heading"><div><span className="eyebrow">CONFIDENCE ≠ ACCURACY</span><h3 id="calibration-title">Does confidence match correctness?</h3></div></div>
        <p className="panel-intro">Compare average Jev confidence with observed Jev-stage accuracy in each bin. Empty bins are unmeasured, not perfect or zero. A small sample is not a calibration guarantee.</p>
        <div className="calibration-legend"><span><i className="confidence-key" />Mean confidence</span><span><i className="accuracy-key" />Observed correctness</span></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Confidence bins, scroll horizontally">
          <table className="calibration-table"><caption className="sr-only">Independent {arm} Jev-stage confidence samples, including completed Jev stages whose later Foundry stage failed.</caption>
            <thead><tr><th scope="col">Confidence bin</th><th scope="col">n / correct</th><th scope="col">Mean confidence</th><th scope="col">Observed accuracy</th></tr></thead>
            <tbody>{analysis.bins.map(bin => <tr key={bin.lower}><th scope="row">{bin.lower.toFixed(1)}–{bin.upper.toFixed(1)}{bin.upper === 1 ? ' inclusive' : ' excl.'}</th><td>{bin.count} / {bin.correct}</td>
              <td>{bin.meanConfidence === null ? 'Unmeasured' : <>{percent(bin.meanConfidence)}<span className="calibration-bar confidence-bar" aria-hidden="true" style={{ width: `${bin.meanConfidence * 100}%` }} /></>}</td>
              <td>{bin.accuracy === null ? 'Unmeasured' : <>{percent(bin.accuracy)}<span className="calibration-bar accuracy-bar" aria-hidden="true" style={{ width: `${bin.accuracy * 100}%` }} /></>}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="chart-footnote">{analysis.samples} confidence samples / {analysis.total} arm observations. Completed Jev stages remain included even if a later Foundry call fails.</p>
      </section>
      <section className="panel confidence-errors" aria-labelledby="confidence-errors-title">
        <div className="panel-heading"><div><span className="eyebrow">WHERE THE GATE DOES NOT PROTECT</span><h3 id="confidence-errors-title">High-confidence mistakes</h3></div></div>
        <div className="error-total"><strong>{analysis.samples ? analysis.highConfidenceErrors : '—'}</strong><span>wrong Jev choices at confidence ≥ {run.options.threshold.toFixed(2)}</span></div>
        <p className="panel-intro">{analysis.samples ? 'A confidence-only gate would retain these choices. Review the rubric and decision evidence, not confidence alone.' : 'No confidence samples in this arm. High-confidence risk is unmeasured.'}</p>
        {errors.length > 0 && <ul className="high-confidence-list">{errors.slice(0, 5).map(row => {
          const jev = row.stages.find(item => item.provider === 'jev')!;
          return <li key={row.id}><strong>{row.caseId} · repetition {row.repetition}</strong><span>{jev.choice} → expected {row.expected}</span><span>{percent(jev.confidence)} confidence</span></li>;
        })}</ul>}
        {errors.length > 5 && <p className="panel-intro">Showing 5 of {errors.length}; all observations are in Cases & results.</p>}
      </section>
    </div>
    {arm === 'jev' && <JevDiagnostics run={run} />}
    {hybrid && <section className="panel hybrid-outcomes" aria-labelledby="hybrid-outcomes-title">
      <div className="panel-heading"><div><span className="eyebrow">ACTUAL ROUTING / NOT A SIMULATION</span><h3 id="hybrid-outcomes-title">What happened after escalation?</h3></div></div>
      <div className="hybrid-outcome-grid">
        <div><strong>{hybrid.escalations}</strong><span>actual escalations</span></div>
        <div><strong>{hybrid.rescued}</strong><span>rescued</span><small>wrong Jev → correct Foundry</small></div>
        <div><strong>{hybrid.regressed}</strong><span>regressed</span><small>correct Jev → wrong Foundry</small></div>
        <div><strong>{hybrid.unchanged}</strong><span>unchanged correctness</span><small>both correct or both wrong</small></div>
        <div><strong>{hybrid.failedEscalations}</strong><span>failed / unavailable</span><small>no completed comparison</small></div>
      </div>
      <p className="chart-footnote">{analysis.total ? `${hybrid.completedEscalations} completed Jev-to-Foundry comparisons. Only actual escalations from this saved hybrid arm count.` : 'Hybrid is unmeasured. Zero event counts do not imply successful routing.'} Other thresholds would require new provider runs to measure their final outcomes.</p>
    </section>}
    <details className="panel threshold-sweep"><summary>Retrospective gate sensitivity — coverage, not new outcomes</summary>
      <p className="panel-intro">Apply different thresholds to these same Jev scores. Coverage uses all {analysis.total} observations in this arm; unavailable confidence cannot be accepted. Accepted accuracy scores Jev only. This does not replay Foundry, estimate hybrid accuracy, or measure new latency.</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Retrospective threshold sensitivity">
        <table><thead><tr><th scope="col">Threshold</th><th scope="col">Accepted</th><th scope="col">Coverage</th><th scope="col">Accepted Jev accuracy</th></tr></thead>
          <tbody>{analysis.thresholdSweep.map(point => <tr key={point.threshold}><th scope="row">≥ {point.threshold.toFixed(2)}</th><td>{point.accepted}</td><td>{percent(point.coverage)}</td><td>{percent(point.accuracy)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
