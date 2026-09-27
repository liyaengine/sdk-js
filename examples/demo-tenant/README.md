# Demo tenant: Fernbank Outdoor

Builds the "ideal tenant" used for live demo sessions — one coherent scenario
(a DTC retailer's shipping & returns copilot) that exercises Domains/Intents,
Guardrail Policies, Domain agentic tools, Prompt Studio, Agents, Workflows,
and — the actual differentiator — an **eval-gated release gate**, all in one
script.

## Prerequisites (one-time, manual)

There's no public API for creating a tenant or an API key — both are
session-authenticated dashboard operations by design.

1. Sign up for a tenant via the dashboard and verify the email.
2. Generate an API key: **Dashboard → Settings → API Keys**.
3. `export LIYA_API_KEY=liya_...`
   `export LIYA_BASE_URL=https://api.liyaengine.ai` (or your staging URL)

## Usage

```bash
npm install
npm run provision     # build the demo tenant
npm run reset         # tear down prior demo resources, then rebuild
npm run reset-only    # just tear down, don't rebuild
```

## What to narrate live

The script prints each phase as it runs. The moment worth slowing down for
is **Section 7 — Evaluations**: the suite is created with a `gate_policy`
(`min_pass_rate: 0.8`), the run executes against the live intent, and the
script prints the real `gate_decision` (`passed`/`failed`) plus specific
failure reasons if it misses. This is the thing no assembled
Braintrust + Humanloop + Guardrails-AI stack ties together out of the box,
because those are three separate vendors with no shared identity graph.

**Section 8 — streaming** is a good closer: real-time `step` events arriving
from `agents.runStream()` as the orchestrator works, not a fake token-by-token
replay of an already-complete answer.

## Not automated here — call out live instead

- BYOK/BYOM model registration is dashboard-only today (see the "Models"
  section of the GTM tiers doc). Mention it as "here's where you'd point this
  at your own OpenAI key or a self-hosted/HuggingFace endpoint" without
  trying to script it.
- The `lookup_order` tool's endpoint defaults to `https://httpbin.org/post`
  for a safe, always-reachable demo target. Set `DEMO_ORDER_LOOKUP_URL` to
  point at a real endpoint if you have one worth showing.
