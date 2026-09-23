import { useState, type FormEvent } from 'react';
import { ArrowRight, Cpu, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { JevChoice, JevDecisionRequest, JevDecisionResult } from '../../shared/jev-converter';
import { errorMessage, request } from '../lib/api';

const initialChoices: JevChoice[] = [
  { id: 'billing', description: 'Billing, payments, refunds, or duplicate charges' },
  { id: 'technical_support', description: 'Product defects, outages, or technical troubleshooting' },
  { id: 'account_access', description: 'Login, password, permissions, or account recovery' },
  { id: 'escalate', description: 'None of the listed choices safely applies' },
];

export function JevConverter({ token }: { token: string }) {
  const [provider, setProvider] = useState<'foundry' | 'local'>('foundry');
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:30000');
  const [deployment, setDeployment] = useState('gpt-5-mini');
  const [question, setQuestion] = useState('I was charged twice for the same subscription.');
  const [choices, setChoices] = useState<JevChoice[]>(initialChoices);
  const [result, setResult] = useState<JevDecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateChoice = (index: number, key: keyof JevChoice, value: string) => {
    setChoices(current => current.map((choice, choiceIndex) => choiceIndex === index ? { ...choice, [key]: value } : choice));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body: JevDecisionRequest = provider === 'foundry'
        ? { provider, deployment, question, choices }
        : { provider, endpoint, question, choices };
      setResult(await request<JevDecisionResult>('/api/local-jev/decide', { body, token }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return <div className="converter-layout">
    <section className="panel converter-form">
      <div className="panel-heading">
        <div><span className="eyebrow">{provider === 'foundry' ? 'MICROSOFT FOUNDRY' : 'LOCAL SGLANG'}</span><h2><Cpu size={17} aria-hidden="true" />Configure a bounded decision</h2></div>
        <span className="local-only"><ShieldCheck size={14} aria-hidden="true" />{provider === 'foundry' ? 'Entra configured' : 'Loopback only'}</span>
      </div>
      <form onSubmit={submit}>
        <fieldset>
          <legend>Model source</legend>
          <div className="converter-provider">
            <label className={provider === 'foundry' ? 'selected' : ''}><input type="radio" name="provider" value="foundry" checked={provider === 'foundry'} onChange={() => setProvider('foundry')} />Microsoft Foundry</label>
            <label className={provider === 'local' ? 'selected' : ''}><input type="radio" name="provider" value="local" checked={provider === 'local'} onChange={() => setProvider('local')} />Local SGLang</label>
          </div>
        </fieldset>
        {provider === 'foundry' ? <>
          <label>Foundry deployment
            <input value={deployment} onChange={event => setDeployment(event.target.value)} required />
          </label>
          <p className="field-help">Uses the Foundry account and Microsoft Entra identity configured in Connections. The deployment must support chat log probabilities.</p>
        </> : <>
          <label>SGLang endpoint
            <input type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} required />
          </label>
          <p className="field-help">Start an SGLang server with a model that supports <code>/tokenize</code> and <code>/v1/score</code>. Remote hosts are rejected.</p>
        </>}
        <label>Decision question
          <textarea value={question} onChange={event => setQuestion(event.target.value)} maxLength={4000} required />
        </label>
        <fieldset>
          <legend>Allowed choices <span>2-{provider === 'foundry' ? '20' : '26'}</span></legend>
          <p className="field-help">Keep an escape choice when the list may not cover every valid outcome.</p>
          <div className="choice-editor">
            {choices.map((choice, index) => <div className="choice-row" key={index}>
              <span className="choice-label" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
              <label><span className="sr-only">Choice {index + 1} ID</span>
                <input value={choice.id} onChange={event => updateChoice(index, 'id', event.target.value)} placeholder="stable_id" required />
              </label>
              <label><span className="sr-only">Choice {index + 1} description</span>
                <input value={choice.description} onChange={event => updateChoice(index, 'description', event.target.value)} placeholder="What this choice means" required />
              </label>
              <button className="icon-button" type="button" aria-label={`Remove choice ${index + 1}`}
                disabled={choices.length <= 2} onClick={() => setChoices(current => current.filter((_, choiceIndex) => choiceIndex !== index))}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>)}
          </div>
          <button className="text-button" type="button" disabled={choices.length >= (provider === 'foundry' ? 20 : 26)}
            onClick={() => setChoices(current => [...current, { id: '', description: '' }])}>
            <Plus size={15} aria-hidden="true" />Add choice
          </button>
        </fieldset>
        {error && <div className="error-notice" role="alert"><p>{error}</p></div>}
        <button className="primary-button converter-submit" type="submit" disabled={busy}>
          {busy ? 'Scoring locally…' : 'Score decision'}<ArrowRight size={16} aria-hidden="true" />
        </button>
      </form>
    </section>

    <aside className="converter-output" aria-live="polite" aria-busy={busy}>
      <section className="panel decision-result">
        <div className="panel-heading"><div><span className="eyebrow">RESULT</span><h2>Probability distribution</h2></div></div>
        {!result ? <div className="converter-empty">
          <span className="empty-mark" aria-hidden="true">A/B</span>
          <h3>No decision scored yet</h3>
          <p>The model will rank only the choices you declare. It does not generate an explanation or JSON response.</p>
        </div> : <div className="score-results">
          <div className="winner">
            <span>Selected decision</span>
            <strong>{result.decision}</strong>
            <span>{(result.confidence * 100).toFixed(1)}% · {result.latencyMs} ms{result.model ? ` · ${result.model}` : ''}</span>
          </div>
          <ol>
            {result.scores.map(score => <li key={score.id}>
              <div><span><b>{score.label}</b>{score.id}</span><strong>{(score.probability * 100).toFixed(1)}%</strong></div>
              <progress max={1} value={score.probability} aria-label={`${score.id}: ${(score.probability * 100).toFixed(1)} percent`} />
              <p>{score.description}</p>
            </li>)}
          </ol>
          <details><summary>Inspect rendered prompt</summary><pre>{result.prompt}</pre></details>
        </div>}
      </section>
      <section className="converter-note">
        <h2>What this recreates</h2>
        <p>This utility implements Jev-style fixed-answer inference: read one-letter next-token scores and normalize only across the declared choices. Foundry uses chat log probabilities; SGLang uses direct label-token scoring.</p>
        <p>It does not reproduce Jev weights, training, RLCD, or calibration. Treat confidence as relative model preference until you evaluate it on labelled examples.</p>
      </section>
    </aside>
  </div>;
}
