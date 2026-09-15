# @liyaengine/sdk

Official TypeScript/JavaScript client for the [Liya Engine](https://liyaengine.ai) public API.

> **Status: early access.** This SDK currently covers the Collections resource. More resources (Domains, Run, Agents, Workflows, Evals) ship incrementally — see [Roadmap](#roadmap).

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
- [ ] Domains (custom domain + intent CRUD)
- [ ] Run / Run (streaming)
- [ ] Agents
- [ ] Workflows
- [ ] Evaluations

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
