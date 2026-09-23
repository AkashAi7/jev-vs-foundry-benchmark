import { useState } from 'react';
import { Check, ExternalLink, KeyRound, LockKeyhole, Plug, Save, ShieldCheck } from 'lucide-react';
import type { ConfigUpdate, PublicConfig } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { ErrorNotice } from './Status';

export function Connections({ config, save }: { config: PublicConfig; save: (update: ConfigUpdate) => Promise<void> }) {
  const [endpoint, setEndpoint] = useState(config.foundryEndpoint);
  const [deployment, setDeployment] = useState(config.foundryDeployment);
  const [model, setModel] = useState(config.jevModel);
  const [jevKey, setJevKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const vscodeAuth = config.foundryAuth === 'vscode';
  const cliAuth = config.foundryAuth === 'azure-cli';
  const submit = async (clearKeys = false) => {
    const update: ConfigUpdate = clearKeys ? { clearKeys: true } : {
      foundryEndpoint: endpoint.trim(), foundryDeployment: deployment.trim(), jevModel: model.trim(),
      ...(jevKey.trim() ? { jevKey: jevKey.trim() } : {}),
    };
    setJevKey('');
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await save(update);
      setMessage(clearKeys ? 'Jev session key cleared. Environment credentials are unchanged.' : 'Connection settings saved. Configured does not mean verified; no provider test was sent.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };
  return <div className="connections-layout">
    <div>
      <section className="panel connections-form" aria-labelledby="providers-title">
        <div className="panel-heading"><div><span className="eyebrow">BRING YOUR OWN PROVIDERS</span><h2 id="providers-title">Provider connections</h2></div><Plug size={19} aria-hidden="true" /></div>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <fieldset disabled={busy}><legend className="sr-only">Provider credentials and model settings</legend>
            <div className="provider-heading"><h3><span className="arm-dot foundry" />Microsoft Foundry</h3><span className={`config-status ${config.foundryConfigured ? 'configured' : ''}`}>{config.foundryConfigured ? 'Configured' : 'Not configured'}</span></div>
            <label>Account inference endpoint<input type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)}
              placeholder="https://your-account.openai.azure.com" autoComplete="url" aria-describedby="endpoint-help" /></label>
            <p id="endpoint-help" className="field-help">Use the account inference endpoint, not a project URL containing /api/projects. HTTPS is required.</p>
            <label>Deployment name<input type="text" value={deployment} onChange={event => setDeployment(event.target.value)}
              placeholder="Your existing model deployment" autoComplete="off" /></label>
            <div className="identity-status"><h3>{cliAuth ? 'Microsoft Entra / Azure CLI developer' : vscodeAuth ? 'Microsoft Entra / VS Code developer' : 'Microsoft Entra service principal'}</h3>
              <p>The server uses explicit <code>{cliAuth ? 'AzureCliCredential' : vscodeAuth ? 'VisualStudioCodeCredential' : 'ClientSecretCredential'}</code>. No Foundry API key or automatic identity fallback is used.</p>
              <strong>{cliAuth
                ? config.foundryIdentityConfigured ? 'Reuses the signed-in az CLI session; sign-in not verified here' : 'Azure CLI identity is not configured'
                : vscodeAuth
                ? config.foundryIdentityConfigured ? 'Resource tenant configured; developer sign-in not verified' : 'Resource tenant is missing'
                : config.foundryIdentityConfigured ? 'Required identity variables are present' : 'Required identity variables are incomplete'}</strong>
              {cliAuth
                ? <p>Run <code>az login</code> (optionally <code>--tenant &lt;resource tenant&gt;</code>) on the server host. This uses an Entra user, not a service principal.</p>
                : vscodeAuth
                ? <p>Sign in through the <strong>Azure Resources</strong> extension on this machine for the configured <code>AZURE_TENANT_ID</code>. This uses an Entra user, not a service principal.</p>
                : <p><code>AZURE_TENANT_ID</code>, <code>AZURE_CLIENT_ID</code>, <code>AZURE_CLIENT_SECRET</code></p>}
              <p>Settings only. Values stay on the server; sign-in, permissions, credential validity and connectivity are not verified here.</p>
              <p>Authentication mode is set on the server via <code>FOUNDRY_AUTH_MODE</code>, not this form. Default: <code>service-principal</code>. Opt-in: <code>vscode</code> or <code>azure-cli</code>. Restart after changing it.</p>
              <p>Before a full benchmark, run <code>npm run check:foundry</code> from the same server environment. It makes one billable Foundry request, not a comparison run.</p>
            </div>
            <div className="provider-divider" />
            <div className="provider-heading"><h3><span className="arm-dot jev" />Jev</h3><span className={`config-status ${config.jevConfigured ? 'configured' : ''}`}>{config.jevConfigured ? 'Configured' : 'Not configured'}</span></div>
            <label>Jev model<input type="text" value={model} onChange={event => setModel(event.target.value)} autoComplete="off" required /></label>
            <label>Jev API key<input type="password" value={jevKey} onChange={event => setJevKey(event.target.value)}
              placeholder={config.jevConfigured ? 'Key is configured · enter to replace' : 'Enter your Jev API key'} autoComplete="new-password" spellCheck={false} /></label>
          </fieldset>
          {error && <ErrorNotice message={error} />}
          {message && <div className="success-notice" role="status"><Check size={17} aria-hidden="true" /><p>{message}</p></div>}
          <div className="connection-actions"><button type="submit" className="primary-button" disabled={busy}><Save size={16} aria-hidden="true" />{busy ? 'Saving…' : 'Save connections'}</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => { void submit(true); }}><KeyRound size={15} aria-hidden="true" />Clear Jev session key</button></div>
          <p className="field-help"><LockKeyhole size={13} aria-hidden="true" />Keys clear from the fields on submit. Never stored in browser localStorage.</p>
        </form>
      </section>
    </div>
    <aside className="connection-guide">
      <section className="panel guide-section"><span className="eyebrow">VS CODE FOUNDRY TOOLKIT</span><h2>Connect the dots.</h2>
        <p className="field-help">Toolkit project selection is managed in VS Code, not detected by this dashboard.</p>
        <ol className="setup-steps">
          <li><span>1</span><div><h3>Select an existing project</h3><p>Open Foundry Toolkit in VS Code. Select your existing Foundry project and a deployed model.</p></div></li>
          <li><span>2</span><div><h3>Copy the inference endpoint</h3><p>Copy the account inference endpoint and the exact deployment name into this form. A project endpoint is not interchangeable.</p></div></li>
          <li><span>3</span><div><h3>Configure the server identity</h3><p>{cliAuth ? 'Run az login on the server host with an identity that has inference access.' : vscodeAuth ? 'Use an approved Azure Resources sign-in and set the resource tenant on the server.' : 'Set the three service-principal environment variables on the server.'} The selected identity must satisfy Conditional Access and have inference access to the deployment.</p></div></li>
        </ol>
        <p className="guide-callout">Toolkit selections and credentials are not automatically inherited by this app. The endpoint and deployment must be configured here.</p>
        <a className="text-link" href="https://learn.microsoft.com/azure/ai-foundry/how-to/develop/vs-code-agents" target="_blank" rel="noreferrer">Foundry Toolkit documentation<ExternalLink size={14} aria-hidden="true" /></a>
        <p><a className="text-link" href="https://learn.microsoft.com/azure/developer/javascript/sdk/authentication/local-development-environment-developer-account" target="_blank" rel="noreferrer">Entra developer authentication<ExternalLink size={14} aria-hidden="true" /></a></p>
      </section>
      <section className="privacy-note"><ShieldCheck size={21} aria-hidden="true" /><div><h2>Keep credentials local.</h2><p>The submitted Jev key is held only in server process memory. Restarting clears its session override. Foundry identity secrets are configured only through the server environment.</p><p>If a credential is exposed, revoke and rotate it with the provider. Never paste keys into shared files, exports or source control.</p></div></section>
      <p className="verification-note">“Configured” is a settings status, not a connectivity test. A live benchmark makes real requests and may incur costs.</p>
    </aside>
  </div>;
}
