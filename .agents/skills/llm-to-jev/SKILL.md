---
name: llm-to-jev
description: Convert a normal Microsoft Foundry chat deployment or locally hosted causal LLM into a Jev-style fixed-choice decision engine using next-token scores. Use for bounded classification, routing, triage, screening, or approval decisions where all outcomes are known before inference.
---

# LLM to Jev

Wrap an existing Microsoft Foundry chat deployment or SGLang-hosted model as a bounded decision endpoint without retraining it.

## Preconditions

- The output is a finite set of 2-26 mutually meaningful choices.
- The caller needs a decision and probability distribution, not generated prose.
- The model exposes either Foundry chat log probabilities or SGLang `/tokenize` and `/v1/score`.
- Include an `other` or `escalate` choice unless the options are provably exhaustive.

## Workflow

1. Give each semantic choice a stable application ID and a one-letter model label (`A` through `Z`).
2. Render the complete prompt so it ends immediately after `Label:`.
3. Choose the scoring lane:
   - **Foundry:** request one completion token with `logprobs: true` and `top_logprobs: 20`. Stop unless every declared label is present. Apply restricted softmax to their log probabilities.
   - **SGLang:** determine the exact continuation at the answer position, call `/tokenize` for every label, and stop if any label is not exactly one unique token.
4. For SGLang, call `/v1/score` once with:

   ```json
   {
     "query": "<rendered prompt ending in Label:>",
     "items": [""],
     "label_token_ids": [32, 33, 34],
     "apply_softmax": true
   }
   ```

5. Preserve ordering while mapping probabilities back to semantic choice IDs.
6. Return the winner, full distribution, model, token usage, latency, and rendered prompt.
7. Put automation thresholds and minimum winning margins in application code.
8. Evaluate thresholds on labelled examples. Restricted-softmax confidence is relative preference among supplied choices, not calibrated correctness.

## Choose the right output mode

- **Fixed-choice scoring:** use for a small, known, stable set of actionable labels when the caller needs a decision rather than generated prose (routing, triage, screening).
- **Structured output:** use when a schema is needed but its field values are not all known in advance; the model still generates tokens, so validate the result.
- **Free-form generation:** use for explanations, summaries, or content that cannot be enumerated before inference.
- **Hybrid cascade:** use when routine cases can take a bounded fast path but uncertainty or high impact needs Foundry or human review. Measure end-to-end latency, escalation rate, and cost, including sequential stages.

## Repository utility

Browser: start the lab with `npm run dev`, then open **Jev converter**.

CLI: create a JSON request and run:

```powershell
npm run jev:decide -- .\decision.json
```

```json
{
  "provider": "foundry",
  "deployment": "gpt-5-mini",
  "question": "I was charged twice for the same subscription.",
  "choices": [
    { "id": "billing", "description": "Billing, payments, refunds, or duplicate charges" },
    { "id": "technical_support", "description": "Product defects or troubleshooting" },
    { "id": "escalate", "description": "None of the listed choices safely applies" }
  ]
}
```

For local SGLang, use:

```json
{
  "provider": "local",
  "endpoint": "http://127.0.0.1:30000",
  "question": "I was charged twice for the same subscription.",
  "choices": [
    { "id": "billing", "description": "Billing, payments, refunds, or duplicate charges" },
    { "id": "technical_support", "description": "Product defects or troubleshooting" },
    { "id": "escalate", "description": "None of the listed choices safely applies" }
  ]
}
```

Foundry's `top_logprobs` interface only exposes its highest-ranked tokens. Stop explicitly if one of the declared labels is absent; do not fabricate a zero probability. SGLang's direct label-token scoring is the more exact implementation.

This recreates the Jev-style inference contract and next-token inference path only. It does not reproduce Jev's model weights, training, RLCD, calibration, evaluation, or full product. Treat observed benchmark results as workload-specific; use representative held-out cases and repeated runs before drawing performance conclusions.
