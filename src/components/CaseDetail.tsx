import { useEffect, useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { ARM_LABELS, type BenchmarkCase, type Observation, type Scenario, type Stage } from '../../shared/types';
import { count, latency, percent } from '../lib/format';

export function CaseDetail({ item, observation, scenario, close }: {
  item: BenchmarkCase; observation: Observation | null; scenario: Scenario | undefined; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={dialog} className="case-dialog" aria-labelledby="detail-title" onCancel={close}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
    <div className="dialog-heading"><div><span className="eyebrow">{item.id} · {scenario?.name ?? item.scenarioId}</span><h2 id="detail-title">{item.title}</h2></div>
      <button className="icon-button" onClick={close} aria-label="Close case details" autoFocus><X size={20} aria-hidden="true" /></button></div>
    <div className="dialog-content">
      <div className="detail-outcomes">
        <div><span>Expected choice</span><strong>{item.expected}</strong></div><ArrowRight size={18} aria-hidden="true" />
        <div><span>Predicted choice</span><strong>{observation?.predicted ?? 'Not available'}</strong></div>
        <div><span>Wall-clock latency</span><strong>{observation ? latency(observation.latencyMs) : 'Not measured'}</strong></div>
      </div>
      <section><h3>Original input</h3><blockquote className="original-input">{item.input}</blockquote></section>
      <section><h3>Shared decision rubric</h3><p>{scenario?.instructions ?? 'Rubric unavailable in this dataset snapshot.'}</p>
        <dl className="rubric-list">{Object.entries(scenario?.criteria ?? {}).map(([choice, description]) => <div key={choice}><dt>{choice}</dt><dd>{description}</dd></div>)}</dl>
      </section>
      {observation && <section><h3>Execution trace <span className={`trace-arm arm-${observation.arm}`}>{ARM_LABELS[observation.arm]}</span></h3>
        <p className="trace-description">Repetition {observation.repetition} · {observation.status} · {observation.correct ? 'Correct decision' : 'Not correct'} · {observation.escalated ? 'Escalated to Foundry' : 'Not escalated'}</p>
        {observation.error && <div className="error-notice"><p><strong>Provider error:</strong> {observation.error}</p></div>}
        {!observation.stages.length && <p className="muted">No successful provider stages were recorded.</p>}
        <ol className="stage-list">{observation.stages.map((stage, index) => <StageDetail key={`${stage.provider}-${index}`} stage={stage} index={index} />)}</ol>
      </section>}
    </div>
    <div className="dialog-footer"><span>Built-in synthetic input · {item.difficulty} case</span><button className="secondary-button" onClick={close}>Close details</button></div>
  </dialog>;
}

function StageDetail({ stage, index }: { stage: Stage; index: number }) {
  return <li className="stage-detail">
    <div className="stage-heading"><span className="stage-number">{index + 1}</span><strong>{stage.provider === 'jev' ? 'Jev decision' : 'Foundry decision'}</strong><span>{latency(stage.latencyMs)}</span></div>
    <dl className="stage-metrics"><div><dt>Actual model</dt><dd>{stage.model}</dd></div><div><dt>Choice</dt><dd>{stage.choice}</dd></div>
      <div><dt>Confidence</dt><dd>{stage.confidence === null ? 'Not reported' : percent(stage.confidence)}</dd></div>
      <div><dt>Input / output tokens</dt><dd>{stage.usage ? `${count(stage.usage.inputTokens)} / ${count(stage.usage.outputTokens)}` : 'Not reported'}</dd></div></dl>
    {stage.probabilities ? <div className="probabilities"><h4>Reported probabilities</h4>
      <dl>{Object.entries(stage.probabilities).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{percent(value)}</dd></div>)}</dl>
    </div> : <p className="field-help">Choice probabilities not reported.</p>}
  </li>;
}
