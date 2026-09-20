# @liyaengine/sdk

Official TypeScript/JavaScript client for the [Liya Engine](https://liyaengine.ai) public API.

> **Status: early access.** This SDK currently covers Collections, Agents, Workflows, and Evaluations. More resources (Domains, Run, Guardrail Policies) ship incrementally — see [Roadmap](#roadmap).

## Install

```bash
npm install @liyaengine/sdk
```

## Quickstart

```ts
import { LiyaEngine } from '@liyaengine/sdk';

const client = new LiyaEngine({ apiKey: process.env.LIYA_API_KEY! });

const collection = await client.collections.create({
  slug: 'contracts',
  label: 'Contracts',
  domain_keys: ['legal-ops'],
});

const collections = await client.collections.list();
```

Get an API key from your [Liya Engine dashboard](https://app.liyaengine.ai) under Settings → API Keys.

## Agents

```ts
const agent = await client.agents.create({
  agent_key: 'support-triage',
  name: 'Support Triage',
  goal: 'Triage incoming support tickets and route them to the right team.',
});

// Agents are created in draft status — deploy to activate for execution.
await client.agents.deploy(agent.agent_key);

const result = await client.agents.run(agent.agent_key, {
  input: { message: 'My order hasn\'t arrived yet.' },
});

const history = await client.agents.listRuns(agent.agent_key);
```

## Workflows

```ts
const workflow = await client.workflows.create({
  name: 'Lead Intake',
  steps: [{ step_type: 'trigger', config: { trigger_subtype: 'webhook' } }],
});

// Workflows are created in draft status — deploy to publish and make them
// callable. Deploying a webhook-triggered workflow for the first time mints
// its webhook secret; capture it immediately, it is never returned again.
const { webhook_url, webhook_secret } = await client.workflows.deploy(workflow.workflow_key);

// Roll the secret with a grace window so in-flight senders don't break.
await client.workflows.rotateWebhookSecret(workflow.workflow_key, 300);

// Flip a deployed workflow on/off without touching its definition.
await client.workflows.toggle(workflow.workflow_key);

const result = await client.workflows.run(workflow.workflow_key, {
  input: { email: 'ada@example.com' },
});

const history = await client.workflows.listRuns(workflow.workflow_key);
```

> `deploy()` and `rotateWebhookSecret()` return the plaintext webhook secret exactly once. Store it immediately — subsequent reads (`get`, `list`) only ever expose `trigger_config.has_secret`.

## Evaluations

A Suite binds a Dataset to one specific intent; `suites.run()` calls that intent for real and scores what it produces. `runs.submit()`/`evaluations.score()` score a response you already generated yourself — no intent execution involved.

```ts
const dataset = await client.evaluations.datasets.create({
  name: 'Support Replies',
  cases: [{ input: { message: 'Where is my order?' } }],
});

const suite = await client.evaluations.suites.create({
  name: 'Order Status Suite',
  domain_key: 'support',
  intent_key: 'order-status',
  dataset_id: dataset.id,
});

// Runs are always async — poll for status/results.
const run = await client.evaluations.suites.run(suite.id);
const result = await client.evaluations.runs.get(run.id);

// A failed run can be resumed — already-scored cases are skipped.
await client.evaluations.runs.resume(run.id);

// Score a response you already generated, no dataset/suite required.
const scored = await client.evaluations.score({
  input: { message: 'Where is my order?' },
  output: 'Your order shipped yesterday and should arrive by Friday.',
});
```

> `custom_scorer_webhook_secret` on a Suite is write-only — it's never returned; only a `custom_scorer_webhook_secret_set` boolean comes back on reads.

## Error handling

Every failed request throws `LiyaEngineAPIError`, a real `Error` subclass carrying the API's `code`, `message`, and HTTP `status`:

```ts
import { LiyaEngineAPIError } from '@liyaengine/sdk';

try {
  await client.collections.create({ slug: 'contracts', label: 'Contracts', domain_keys: ['legal-ops'] });
} catch (err) {
  if (err instanceof LiyaEngineAPIError && err.code === 'SLUG_CONFLICT') {
    // handle the conflict
  }
  throw err;
}
```

Network failures and timeouts throw `LiyaEngineNetworkError` instead. Requests are retried automatically on `429`/`5xx` responses and transient network errors (2 retries by default).

## Configuration

```ts
new LiyaEngine({
  apiKey: 'liya_...',
  baseUrl: 'https://api.liyaengine.ai', // override for local/staging
  timeoutMs: 30_000,
  maxRetries: 2,
});
```

## Roadmap

- [x] Collections
- [x] Agents (full CRUD, deploy, run, run/session history)
- [x] Workflows (full CRUD, toggle, deploy, webhook secret rotate, run, run history)
- [x] Evaluations (Datasets/Cases/Suites/Runs/Reviews CRUD, suite execution, cancel/resume, statistical + pairwise compare, standalone scoring)
- [ ] Domains (custom domain + intent CRUD)
- [ ] Run / Run (streaming)
- [ ] Guardrail Policies

Full docs: https://liyaengine.ai/docs/sdks/javascript

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
