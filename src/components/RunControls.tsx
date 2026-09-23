import { ArrowRight, Info, Play, SlidersHorizontal } from 'lucide-react';
import { ARMS, ARM_LABELS, type BenchmarkCase, type PublicConfig, type RunOptions, type Scenario } from '../../shared/types';

export function RunControls({ options, setOptions, scenarios, cases, config, busy, active, start }: {
  options: RunOptions; setOptions: (options: RunOptions) => void; scenarios: Scenario[];
  cases: BenchmarkCase[]; config: PublicConfig; busy: boolean; active: boolean; start: () => void;
}) {
  const total = cases.filter(item => options.scenarioIds.includes(item.scenarioId)).length
    * options.arms.length * options.repetitions;
  const needsFoundry = options.arms.some(arm => arm === 'foundry' || arm === 'hybrid');
  const needsJev = options.arms.some(arm => arm === 'jev' || arm === 'hybrid');
  const connectionMissing = options.mode === 'live'
    && ((needsFoundry && !config.foundryConfigured) || (needsJev && !config.jevConfigured));
  const invalid = total === 0 || options.repetitions < 1 || options.repetitions > 10
    || !Number.isInteger(options.repetitions) || options.threshold < 0 || options.threshold > 1
    || !Number.isSafeInteger(options.seed) || !Number.isFinite(options.threshold);
  const toggleScenario = (id: string) => setOptions({ ...options, scenarioIds: options.scenarioIds.includes(id)
    ? options.scenarioIds.filter(value => value !== id) : [...options.scenarioIds, id] });

  return <section className="panel run-controls" aria-labelledby="controls-title">
    <div className="panel-heading"><h2 id="controls-title"><SlidersHorizontal size={17} aria-hidden="true" />Run configuration</h2><span className="tiny-label">01</span></div>
    <form onSubmit={event => { event.preventDefault(); if (!invalid && !connectionMissing) start(); }}>
      <fieldset disabled={busy || active}>
        <legend className="sr-only">Benchmark options</legend>
        <fieldset className="mode-fieldset">
          <legend>Run mode</legend>
          <div className="mode-options">
            {(['live', 'demo'] as const).map(mode => <label key={mode} className={options.mode === mode ? 'selected' : ''}>
              <input type="radio" name="run-mode" value={mode} checked={options.mode === mode}
                onChange={() => setOptions({ ...options, mode })} />
              {mode === 'demo' ? 'Synthetic fixture' : 'Live providers'}<span>{mode === 'demo' ? 'Not measured · opt-in' : 'Measured requests'}</span>
            </label>)}
          </div>
        </fieldset>
        <fieldset className="selection-fieldset">
          <legend>Decision scenarios <span>{options.scenarioIds.length} selected</span></legend>
          {scenarios.map(scenario => <label className="scenario-option" key={scenario.id}>
            <input type="checkbox" checked={options.scenarioIds.includes(scenario.id)} onChange={() => toggleScenario(scenario.id)} />
            <span>{scenario.name}<small>{cases.filter(item => item.scenarioId === scenario.id).length} cases</small></span>
          </label>)}
        </fieldset>
        <fieldset className="selection-fieldset">
          <legend>Comparison arms <span>{options.arms.length} selected</span></legend>
          <div className="arm-options">{ARMS.map(arm => <label key={arm} className={`arm-option arm-${arm}`}>
            <input type="checkbox" checked={options.arms.includes(arm)} onChange={() => setOptions({
              ...options, arms: options.arms.includes(arm) ? options.arms.filter(value => value !== arm) : [...options.arms, arm],
            })} /><span className={`arm-dot ${arm}`} />{ARM_LABELS[arm]}
          </label>)}</div>
        </fieldset>
        <div className="number-fields">
          <label>Repetitions<input type="number" min="1" max="10" step="1" required value={options.repetitions}
            onChange={event => setOptions({ ...options, repetitions: event.target.valueAsNumber || 0 })} /></label>
          <label>Seed<input type="number" step="1" required value={options.seed}
            onChange={event => setOptions({ ...options, seed: event.target.valueAsNumber || 0 })} /></label>
        </div>
        <label className="threshold-label">Hybrid confidence gate<strong>{options.threshold.toFixed(2)}</strong>
          <input type="range" min="0" max="1" step="0.01" value={options.threshold}
            onChange={event => setOptions({ ...options, threshold: event.target.valueAsNumber })} />
        </label>
        <p className="field-help">Below this Jev confidence, ask Foundry. The hybrid records both stages.</p>
      </fieldset>
      {options.mode === 'live' && <div className="live-warning"><Info size={15} aria-hidden="true" /><p>
        Live runs may incur provider costs. Only the selected built-in synthetic inputs and rubrics are sent. No user data import.
      </p></div>}
      {options.mode === 'demo' && <p className="live-warning">Synthetic choices, latency and token usage illustrate the interface only. They are not benchmark evidence.</p>}
      {connectionMissing && <p className="field-error" role="status">Configure the selected providers in Connections before running live.</p>}
      {invalid && <p className="field-error" role="status">Select at least one scenario and arm. Use 1–10 repetitions and a whole-number seed.</p>}
      <div className="run-total"><span>Planned observations</span><strong>{Number.isFinite(total) ? total : 0}</strong></div>
      <button className="primary-button run-button" type="submit" disabled={busy || active || invalid || connectionMissing}>
        <Play size={16} aria-hidden="true" />{busy ? 'Submitting…' : active ? 'Benchmark running…' : options.mode === 'live' ? 'Run live benchmark' : 'Generate synthetic fixture'}<ArrowRight size={16} aria-hidden="true" />
      </button>
      <p className="control-footnote">Seeded order · serial execution · no retries</p>
    </form>
  </section>;
}
