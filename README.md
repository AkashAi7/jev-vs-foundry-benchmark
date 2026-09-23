# Jev Benchmark Lab

A local visual comparison of **Foundry LLM**, **Jev**, and **Foundry + Jev** on the same structured decisions. Explore accuracy, macro F1, latency, completed-stage token usage, routing, and individual predictions. Run history and reproducible JSON/CSV exports stay on your machine.

**Sample runs are deterministic synthetic fixtures, not measured provider performance.** Live runs call real providers; failures remain visible and never fall back to samples. No inference starts automatically.

**Bring your own provider setup:** this repository contains no provider credentials. Configure your own TypeSafe key and your own Foundry endpoint, deployment, and approved identity locally.

## Infographics

- [Runnable Jev vs LLM benchmark](deliverables/jev-vs-llm-runnable-benchmark.png) — measured pilot differences, a proposed LLM-win scenario, and instructions for running the comparison ([SVG source](deliverables/jev-vs-llm-runnable-benchmark.svg)).
- [General Jev vs LLM task-fit guide](deliverables/jev-vs-llm-general.png) — where each inference pattern fits and where Jev performs poorly with an incomplete taxonomy ([SVG source](deliverables/jev-vs-llm-general.svg)).
- [Jev vs Microsoft Foundry pilot](deliverables/jev-vs-foundry-benchmark.png) — one completed 18-case run with methodology caveats ([SVG source](deliverables/jev-vs-foundry-benchmark.svg)).

## Run locally

Requires Node.js 22.12+ (tested with Node.js 24).

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:4317**. The dashboard is a benchmark report: measured comparisons, scenario breakdowns, Jev confidence diagnostics and case-level evidence. Live measurement is the default; synthetic fixtures are an explicit opt-in for layout demonstrations only.

### Convert a local LLM into a Jev-style decision engine

The separate **Jev converter** workspace utility follows the fixed-answer scoring approach described in [Build Your Own Jev Locally](https://medium.com/coding-nexus/build-your-own-jev-locally-run-a-100-private-ai-agent-on-your-machine-bb98126d394a). It can wrap a normal Microsoft Foundry chat deployment through one-token log probabilities, or connect to a loopback SGLang server through direct `/v1/score` label-token scoring. Both lanes map a restricted-softmax distribution back to semantic choices. It does not modify or depend on the infographic deliverables.

The same implementation is available as a CLI. Save the endpoint, question, and 2-26 `{ "id", "description" }` choices in a JSON file, then run:

```powershell
npm run jev:decide -- .\decision.json
```

Keep an `escalate` choice when the options are not exhaustive. The returned confidence is relative preference among the declared choices, not calibrated correctness. The reusable project skill is in `.agents/skills/llm-to-jev/`.

For Foundry, use `{ "provider": "foundry", "deployment": "YOUR_DEPLOYMENT", ... }`; the existing account endpoint and Microsoft Entra identity are reused from Connections. The deployment must support chat `logprobs`, and all choice labels must appear in the returned top-token set. For SGLang, use `{ "provider": "local", "endpoint": "http://127.0.0.1:30000", ... }`.

```powershell
npm test
npm run typecheck
npm run build
npm start
```

The production command requires a successful build. The server listens only on IPv4 loopback. If port 4317 is occupied, set `PORT` before starting, or in your local environment file. This is a single-user local tool, not an internet-facing service.

## Connect real providers

### Jev / TypeSafe

Enter your own TypeSafe API key in the dashboard's Connections form. Keys are held in server memory and not returned to the browser or included in saved results. The form is cleared after a successful save.

For optional persistent configuration, copy [.env.example](.env.example) to `.env` and fill it locally. `.env`, local results, dependencies, and build output are ignored by [.gitignore](.gitignore). Do not commit credentials, share the local environment file, or place keys in any `VITE_*` variable. Environment-file keys are reloaded on restart even after clearing memory through the UI.

The default Jev model is `jev-latest`. Actual resolved model identifiers are recorded per stage. The adapter uses the official TypeSafe JavaScript SDK, Choice questions, and the fixed `https://api.typesafe.ai` service.

### Microsoft Foundry Toolkit in VS Code

1. Open the **Microsoft Foundry Toolkit** extension in VS Code and sign in.
2. Select your existing Foundry project and inspect its model deployments. Choose a deployment supporting **Chat Completions and strict JSON-schema structured output**.
3. Copy its **account inference endpoint** and **deployment name** into Connections. A deployment name is not necessarily the catalog model name.
4. Use an account endpoint such as `https://YOUR-ACCOUNT.openai.azure.com` or `https://YOUR-ACCOUNT.services.ai.azure.com`. The app normalizes it to `/openai/v1/`.
5. Do **not** paste the project URL ending in `/api/projects/...`. Custom proxies, sovereign-cloud domains, nondefault ports, query parameters, and project paths are not supported by this local version.
6. Foundry defaults to explicit **`ClientSecretCredential`** (`FOUNDRY_AUTH_MODE=service-principal`), with scope `https://ai.azure.com/.default`. Set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` in the server process environment, then restart. The secret is the client-secret **value**, not its ID. No Foundry API key is used and there is no fallback to personal Azure CLI or VS Code sign-in.
7. The selected identity needs inference access to the account. For an OpenAI deployment, **Cognitive Services OpenAI User** is sufficient; general Foundry model inference can use **Cognitive Services User**. Resource visibility, Owner or Contributor alone do not prove inference access. The app never changes role assignments.

No resources are provisioned or deployments created by this app. Use your own Foundry account inference endpoint, deployment name, and explicitly selected identity. Microsoft Foundry Toolkit can help you discover your project and deployments, but this benchmark sends inference requests from the local Node process; selecting a Toolkit project alone does not configure authentication.

Connections shows configuration readiness, not a successful authentication probe. No provider request is sent until an explicit live benchmark or the connectivity check below. Selecting only Jev permits Jev-only live runs without Foundry; the hybrid always requires both providers to be configured.

If token acquisition fails with **AADSTS53003**, Microsoft Entra Conditional Access blocked token issuance before model inference. An administrator should review **Entra ID > Monitoring & health > Sign-in logs > Service principal sign-ins > Conditional Access** (or **User sign-ins** for VS Code mode) and establish an approved execution environment or identity configuration. Do not disable or circumvent policy. An approved developer identity is a separate local-development option, not a repair of the denied service principal. See [Microsoft's workload-identity troubleshooting guidance](https://learn.microsoft.com/entra/identity/conditional-access/workload-identity#sign-in-logs).

#### Optional approved VS Code developer identity

If developer-user inference is permitted, explicitly select `FOUNDRY_AUTH_MODE=vscode`. This uses **`VisualStudioCodeCredential` with `@azure/identity-vscode` 2.x**, not `DefaultAzureCredential` or an automatic fallback chain. It does not use the service-principal secret, an API key, or manually exported tokens. The native integration is loaded only on the first token request in this mode.

1. Sign in through the **Azure Resources** extension with an approved user. Selecting a Foundry Toolkit project alone is not enough. The obsolete Azure Account extension is not the integration used here.
2. Set `AZURE_TENANT_ID` to the tenant owning the Foundry resource. The signed-in user must satisfy that tenant's Conditional Access/MFA and have inference RBAC on the account.
3. Explicitly opt in in the same PowerShell terminal that will launch the server:

   ```powershell
   $env:FOUNDRY_AUTH_MODE = 'vscode'
   # Keep the existing AZURE_TENANT_ID only if it is the resource's tenant.
   npm run check:foundry
   ```

4. Only after the check returns `"status": "success"`, restart the dashboard from that terminal (`npm run dev`), confirm **Microsoft Entra / VS Code developer** in Connections, and start a new live comparison. Re-enter the Jev session key if restarting cleared it. Existing reports are not changed.

Alternatively persist the nonsecret mode in your ignored local `.env`. Existing process environment variables take precedence over that file. Authentication mode cannot be switched through the browser. Set `FOUNDRY_AUTH_MODE=service-principal` and restart to switch back to service-principal authentication.

> **Managed/corporate devices:** `AZURE_TENANT_ID` (and other `AZURE_*` variables) may already be set at the Windows User or Machine environment-variable scope by device management tooling, often pointing at your organization's primary tenant rather than the Foundry resource's tenant. Because process environment variables always take precedence over `.env` (see above), this can silently override the tenant you configured, producing a `Token tenant ... does not match resource tenant` error even though `.env` looks correct. Check with `[Environment]::GetEnvironmentVariable("AZURE_TENANT_ID","User")` / `"Machine"`. If it does not match the resource tenant, do not change the persistent machine-wide value; instead set it explicitly in the same terminal before launching, so it overrides for that process only: `$env:AZURE_TENANT_ID = '<resource-tenant-id>'` then `npm run dev` / `npm run check:foundry`.

This is an opt-in identity route; no user identity is activated automatically. If sign-in is missing, policy denies access, the native integration cannot load, or RBAC is insufficient, the check/run fails visibly and never tries another identity. The current plugin supports Windows and Linux, not macOS. See [local developer authentication](https://learn.microsoft.com/azure/developer/javascript/sdk/authentication/local-development-environment-developer-account) and the [current Azure SDK integration README](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity-vscode/README.md).

#### Optional approved Azure CLI developer identity

On machines where the VS Code/OS identity broker is joined to a different Microsoft Entra tenant than the Foundry resource (common on managed corporate devices), `VisualStudioCodeCredential` can silently resolve tokens for the wrong tenant even with `AZURE_TENANT_ID` set, producing `Token tenant ... does not match resource tenant`. If an already-authenticated, MFA-satisfying `az login` session exists for the resource's tenant, explicitly select `FOUNDRY_AUTH_MODE=azure-cli`. This uses **`AzureCliCredential`**, not `DefaultAzureCredential` or an automatic fallback chain. It does not use the service-principal secret, an API key, or manually exported tokens, and it never tries another identity if the CLI session is missing or wrong.

1. Run `az login --tenant <resource-tenant-id>` (and `az account set --subscription <id>` if needed) so the CLI session is scoped to the tenant that owns the Foundry resource.
2. Ensure that signed-in user has inference RBAC on the account (for example **Cognitive Services OpenAI User**); Owner/Contributor alone is not sufficient.
3. Explicitly opt in in the same terminal that will launch the server:

   ```powershell
   $env:FOUNDRY_AUTH_MODE = 'azure-cli'
   npm run check:foundry
   ```

4. Only after the check returns `"status": "success"`, restart the dashboard from that terminal (`npm run dev`), confirm **Microsoft Entra / Azure CLI developer** in Connections, and start a new live comparison.

Alternatively persist the nonsecret mode in your ignored local `.env`. Set `FOUNDRY_AUTH_MODE=service-principal` and restart to return to the original identity.

#### One-request Foundry connectivity check

`npm run check:foundry` uses the same configured identity, endpoint, deployment, strict output schema, deadline, and no-retry adapter as the benchmark. It makes **one potentially billable Foundry request** using the first built-in synthetic case; it never calls Jev. It returns redacted JSON with status, auth mode, resolved model and usage, and exits nonzero on failure. It does not save a benchmark or claim comparative accuracy. Run it from the workspace with the same environment as the server; unsaved Connections overrides are not shared with this separate process.

### Recorded pilot snapshot

The standalone infographic reports one completed live run: 18 cases per arm, one repetition, and a 0.80 hybrid confidence gate (54 observations total). Foundry, Jev, and Foundry + Jev each returned **18/18 correct** (100% accuracy; macro F1 1.000) on this test set. Median / p95 latency was **2,459 / 6,026 ms** for Foundry, **398 / 539 ms** for Jev, and **417 / 1,731 ms** for the hybrid. The hybrid escalated 1 of 18 cases. These are observations from one small synthetic, hand-labelled pilot—not a statistically significant result, a general model ranking, or a production-performance claim. Provider cost was not measured.

### Jev diagnostic report

- Confidence bins compare Jev's reported confidence with observed label correctness, showing sample counts and empty bins explicitly. Confidence is not the chosen-label probability and is not assumed calibrated.
- The saved run threshold governs acceptance (including equality). High-confidence mistakes remain visible rather than being hidden by the gate.
- Standalone Jev and hybrid Jev requests are analyzed separately. Completed Jev evidence survives failed Foundry escalations.
- Hybrid outcomes distinguish rescued mistakes, regressions, unchanged correctness and failed escalations.
- A threshold sweep reports retrospective acceptance accuracy and coverage over completed observations, including errors in the coverage denominator. It does **not** simulate Foundry decisions at new thresholds or predict a new hybrid accuracy.
- JSON exports contain these diagnostics and scenario summaries alongside original observations and the dataset snapshot.

### Charges and privacy

Live mode sends each selected case's input, labels, and rubric to the chosen providers. Hybrid escalation also sends Jev's advisory prediction to Foundry. Expected answers, case IDs, and difficulty labels are not sent to either provider. The built-in inputs are synthetic, not customer data.

Provider calls may incur charges. One repetition across all 18 cases and three arms makes **54 to 72 inference requests**, depending on the number of hybrid escalations. Ten repetitions make up to 720. No price or cost estimate is fabricated from tokens.

## What is compared

| Arm | Decision procedure |
| --- | --- |
| Foundry LLM | Original input and rubric to a Foundry deployment; one schema-constrained label. |
| Jev | Original input and rubric to a TypeSafe Choice question; label, confidence, probabilities. |
| Foundry + Jev | A fresh Jev request; accept when confidence is **greater than or equal to** the threshold. Otherwise call Foundry with the original task plus advisory Jev evidence. |

Hybrid is a **confidence-gated cascade**, not a model fine-tune, general chatbot, or RAG benchmark. Jev's confidence field is distinct from the selected label's probability. Default threshold: 0.8. The standalone Jev result is never reused for the hybrid observation; hybrid latency and usage include its own completed stages.

### Dataset and execution

- [shared/scenarios.ts](shared/scenarios.ts) defines 18 hand-labelled cases: support triage, incident priority, and subscription intent.
- Each scenario has six cases, split between standard and edge examples (negation, quoted instructions, competing cues, resolved incidents).
- Every selected case is evaluated by every selected arm, with 1-10 repetitions.
- Edit the scenarios and expected labels in [shared/scenarios.ts](shared/scenarios.ts) to try your own synthetic test set. Keep credentials out of that file and other source-controlled inputs.
- A seeded shuffle interleaves arms/cases/repetitions; execution is serial to avoid concurrency as a confounder.
- Default seed: 42. It controls execution order and sample fixtures, **not remote-model determinism**.
- Each stage has a 60-second deadline and zero retries. Foundry has a 2,048 completion-token cap. No temperature is forced.
- Full dataset/rubric, SHA-256 dataset hash, options, protocol version, endpoint, configured/observed model IDs, stage usage, and timestamps are saved with every run. New reports also record the selected Foundry auth mode (not identity details); sample/Jev-only runs record no Foundry auth. Historical reports without that field remain explicitly "not recorded", never inferred from current settings.
- The dataset hash covers the full dataset, including unselected scenarios. Historical results use their saved dataset snapshot.

### Metric definitions

| Metric | Definition |
| --- | --- |
| Accuracy | Correct predictions / all completed observations. Provider errors count as incorrect. |
| Macro F1 | Unweighted average of per-label F1 across represented scenarios. Null predictions are false negatives; labels without support score zero. |
| Mean / p50 / p95 latency | Successful observation latency only. Percentiles use linear interpolation. Error latencies are retained in individual observations. |
| Token usage | Sum of reported input/output tokens for **completed stages**. Missing usage is unknown, not zero-priced; partial totals are labelled. |
| Escalation | Hybrid observations routed to Foundry after low Jev confidence, including failed escalations. |
| Foundry calls | Successfully recorded Foundry stages, **not all attempted or billable calls**. |

Live observation latency uses local wall-clock time, including provider/network/authentication overhead. Hybrid adds both sequential stages. Sample latency is the sum of fixture values, not the time it takes to animate the UI.

An individual request failure records a safe error and preserves earlier completed stages. A run can be completed with provider errors; check error counts rather than treating completion as success. Refusals, truncated outputs, unsupported structured output, invalid labels/distributions, and malformed responses are errors.

Cancellation retains earlier completed observations but drops the in-flight observation. Failed or cancelled calls may still be billable, and token usage from their unfinished stages is unavailable. In particular, cancelling during hybrid escalation can omit that observation's already completed Jev stage. **Exports are not billing records.**

### Interpreting results responsibly

This is a small synthetic **pilot harness**, not a statistically defensible leaderboard. Accuracy depends on hand-authored rubrics and labels. Repeated evaluations are not independent new examples. The threshold has not been calibrated on a held-out dataset; use separate calibration and test sets before making production claims.

The three arms have different output contracts, and the hybrid sees additional advisory evidence. First-call credential/network overhead, remote load, and mutable model aliases can affect results. Token counts are not directly comparable costs across provider tokenizers. Extend the dataset and repeat live measurements on representative workloads before deciding which design is better.

## Saved data and exports

Runs are atomically saved after each observation under `.local\runs`. They survive browser reloads and server restarts. A run interrupted by a stopped server is marked `interrupted`, with partial results retained.

- JSON includes complete observations, dataset, protocol, and summaries.
- CSV includes per-observation fields, stage JSON, settings, and usage completeness. The appended `foundry_auth` column is `service-principal`, `vscode`, `azure-cli`, `not-used`, or `not-recorded` for historical data. Cells are quoted and spreadsheet-formula prefixes escaped.
- Both formats identify `demo` versus `live`; sample JSON contains a prominent synthetic-data notice.
- Credentials and the request-verification token are not exported.
- Corrupt saved records stop startup with an explicit error. Move the named record out of `.local\runs` and restart; do not silently discard evidence.

Keep these files private if you customize the inputs: datasets and predictions are stored in plaintext. File permissions use the host OS defaults/ACLs on Windows; local disk encryption and access control remain your responsibility.

## API and implementation

The UI and API share port 4317. State-changing requests require JSON and the local request token from `/api/bootstrap`. Host/Origin/Fetch Metadata checks limit cross-site browser requests; these are not a replacement for authentication on a public deployment.

```text
GET  /api/health
GET  /api/bootstrap
GET  /api/runs/:id
POST /api/runs
POST /api/runs/:id/cancel
POST /api/config
GET  /api/runs/:id/export?format=json|csv
```

Key code: [provider adapters](server/providers.ts), [hybrid pipeline](server/pipeline.ts), [run scheduler](server/runner.ts), [metrics](shared/metrics.ts), and [tests](tests).

## References

- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
- [Foundry structured outputs](https://learn.microsoft.com/azure/foundry/openai/how-to/structured-outputs?pivots=programming-language-javascript)
- [Foundry OpenAI API lifecycle](https://learn.microsoft.com/azure/foundry/openai/api-version-lifecycle)

## License

This project is licensed under the [MIT License](LICENSE).
