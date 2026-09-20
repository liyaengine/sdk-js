import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureDataset = {
  id: 'ds_123',
  tenant_id: 'tenant_1',
  name: 'Support Replies',
  description: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const fixtureCase = {
  id: 'case_123',
  tenant_id: 'tenant_1',
  dataset_id: 'ds_123',
  input: { q: 'hi' },
  message: null,
  expected_output: null,
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const fixtureSuite = {
  id: 'suite_123',
  tenant_id: 'tenant_1',
  name: 'Refund Suite',
  domain_key: 'support',
  intent_key: 'refund',
  dataset_id: 'ds_123',
  custom_scorer_expression: null,
  custom_scorer_label: null,
  custom_scorer_webhook_url: null,
  custom_scorer_webhook_secret_set: false,
  baseline_run_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const fixtureRun = {
  id: 'run_123',
  tenant_id: 'tenant_1',
  suite_id: 'suite_123',
  domain_key: 'support',
  intent_key: 'refund',
  execution_mode: 'liya_intent',
  triggered_by: 'api',
  status: 'pending',
  stage: null,
  progress: 0,
  mean_score: null,
  dimension_scores: null,
  cases_total: 1,
  cases_passed: 0,
  started_at: '2026-01-01T00:00:00.000Z',
  completed_at: null,
  error: null,
  judge_total_cost_usd: null,
  judge_model: null,
  judge_calls: null,
  judge_failures: null,
  judge_cap_reached: false,
  model_override: null,
};

const server = setupServer(
  http.get(`${BASE_URL}/v1/evals/datasets`, () => HttpResponse.json({ success: true, data: { datasets: [fixtureDataset] } })),
  http.post(`${BASE_URL}/v1/evals/datasets`, () =>
    HttpResponse.json({ success: true, data: { id: 'ds_new', name: 'New Dataset', description: null, case_count: 0, created_at: '2026-01-01T00:00:00.000Z' } }, { status: 201 }),
  ),
  // Registered before /datasets/:id — mirrors the real API's Express route
  // order (a literal "templates" segment would otherwise be swallowed as :id).
  http.get(`${BASE_URL}/v1/evals/datasets/templates`, () =>
    HttpResponse.json({ success: true, data: { templates: [{ id: 'tpl_1', name: 'Starter', description: null, case_count: 3, example_cases: [] }] } }),
  ),
  http.post(`${BASE_URL}/v1/evals/datasets/templates/:id/clone`, () =>
    HttpResponse.json({ success: true, data: { dataset: { ...fixtureDataset, id: 'ds_cloned' } } }, { status: 201 }),
  ),
  http.get(`${BASE_URL}/v1/evals/datasets/:id`, () => HttpResponse.json({ success: true, data: { dataset: { ...fixtureDataset, cases: [fixtureCase] } } })),
  http.patch(`${BASE_URL}/v1/evals/datasets/:id`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ success: true, data: { dataset: { ...fixtureDataset, ...body } } });
  }),
  http.delete(`${BASE_URL}/v1/evals/datasets/:id`, () => HttpResponse.json({ success: true })),
  http.post(`${BASE_URL}/v1/evals/datasets/:id/import`, () => HttpResponse.json({ success: true, data: { imported: 2 } }, { status: 201 })),

  http.post(`${BASE_URL}/v1/evals/datasets/:id/cases`, () => HttpResponse.json({ success: true, data: { case: fixtureCase } }, { status: 201 })),
  http.patch(`${BASE_URL}/v1/evals/cases/:caseId`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ success: true, data: { case: { ...fixtureCase, ...body } } });
  }),
  http.delete(`${BASE_URL}/v1/evals/cases/:caseId`, () => HttpResponse.json({ success: true })),

  http.get(`${BASE_URL}/v1/evals/suites`, () => HttpResponse.json({ success: true, data: { suites: [fixtureSuite] } })),
  http.post(`${BASE_URL}/v1/evals/suites`, () => HttpResponse.json({ success: true, data: { suite: fixtureSuite } }, { status: 201 })),
  http.patch(`${BASE_URL}/v1/evals/suites/:id`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ success: true, data: { suite: { ...fixtureSuite, ...body } } });
  }),
  http.delete(`${BASE_URL}/v1/evals/suites/:id`, () => HttpResponse.json({ success: true })),
  http.patch(`${BASE_URL}/v1/evals/suites/:id/baseline`, () => HttpResponse.json({ success: true, data: { suite: { ...fixtureSuite, baseline_run_id: 'run_123' } } })),
  http.post(`${BASE_URL}/v1/evals/suites/:id/run`, () => HttpResponse.json({ success: true, data: { run: fixtureRun } }, { status: 202 })),
  http.get(`${BASE_URL}/v1/evals/suites/:id/runs`, () => HttpResponse.json({ success: true, data: { runs: [fixtureRun] } })),
  http.post(`${BASE_URL}/v1/evals/suites/:id/compare-models`, () =>
    HttpResponse.json({ success: true, data: { run_a: { ...fixtureRun, id: 'run_a', model_override: 'gpt-4o-mini' }, run_b: { ...fixtureRun, id: 'run_b', model_override: 'gpt-4o' } } }, { status: 202 }),
  ),

  http.post(`${BASE_URL}/v1/evals/results/:resultId/reviews`, () =>
    HttpResponse.json({ success: true, data: { review: { id: 'rev_1', tenant_id: 'tenant_1', run_result_id: 'result_1', reviewer_id: 'key_1', verdict: 'agree', corrected_score: null, note: null, created_at: '2026-01-01T00:00:00.000Z' } } }, { status: 201 }),
  ),
  http.delete(`${BASE_URL}/v1/evals/reviews/:id`, () => HttpResponse.json({ success: true })),

  http.get(`${BASE_URL}/v1/evals/runs`, () => HttpResponse.json({ success: true, data: { runs: [fixtureRun] } })),
  http.post(`${BASE_URL}/v1/evals/runs`, () => HttpResponse.json({ success: true, data: { run_id: 'run_ext' } }, { status: 202 })),
  http.get(`${BASE_URL}/v1/evals/runs/:id`, ({ params }) => {
    if (params.id === 'missing') {
      return HttpResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'not found' } }, { status: 404 });
    }
    return HttpResponse.json({
      success: true,
      data: { id: 'run_123', status: 'completed', stage: null, progress: 100, mean_score: 4.5, dimension_scores: { llm_coherence: 4.5 }, cases_total: 1, cases_passed: 1, started_at: '2026-01-01T00:00:00.000Z', completed_at: '2026-01-01T00:01:00.000Z', error: null, results: [{ case_id: 'case_123', passed: true, scores: [], latency_ms: 100, error: null }] },
    });
  }),
  http.post(`${BASE_URL}/v1/evals/runs/:id/cancel`, () => HttpResponse.json({ success: true, data: { run: { ...fixtureRun, status: 'cancelled' } } })),
  http.post(`${BASE_URL}/v1/evals/runs/:id/resume`, () => HttpResponse.json({ success: true, data: { run: { ...fixtureRun, status: 'pending' } } })),
  http.get(`${BASE_URL}/v1/evals/runs/:id/compare`, () =>
    HttpResponse.json({ success: true, data: { comparison: { run_a: {}, run_b: {}, score_delta: {}, winner: 'run_a', summary: 'Run A wins.' }, run_a: {}, run_b: {} } }),
  ),
  http.post(`${BASE_URL}/v1/evals/runs/:id/compare-pairwise`, () =>
    HttpResponse.json({ success: true, data: { comparison: { cases_compared: 1, total_cost_usd: 0.001, unmatched_cases: 0 }, run_a: {}, run_b: {} } }),
  ),

  http.post(`${BASE_URL}/v1/evals/score`, () =>
    HttpResponse.json({ success: true, data: { passed: true, score: 4, checks: [{ check_type: 'llm_coherence', passed: true, judge_score: 4 }] } }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

describe('evaluations.datasets', () => {
  it('lists datasets', async () => {
    const datasets = await client().evaluations.datasets.list();
    expect(datasets).toHaveLength(1);
    expect(datasets[0].name).toBe('Support Replies');
  });

  it('gets a dataset with its cases', async () => {
    const dataset = await client().evaluations.datasets.get('ds_123');
    expect(dataset.cases).toHaveLength(1);
  });

  it('creates a dataset', async () => {
    const created = await client().evaluations.datasets.create({ name: 'New Dataset' });
    expect(created.id).toBe('ds_new');
  });

  it('updates a dataset', async () => {
    const updated = await client().evaluations.datasets.update('ds_123', { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it('deletes a dataset', async () => {
    await expect(client().evaluations.datasets.delete('ds_123')).resolves.toBeUndefined();
  });

  it('imports cases', async () => {
    const imported = await client().evaluations.datasets.importCases('ds_123', [{ input: { q: 'a' } }, { input: { q: 'b' } }]);
    expect(imported).toBe(2);
  });

  it('lists and clones templates', async () => {
    const templates = await client().evaluations.datasets.templates.list();
    expect(templates).toHaveLength(1);
    const cloned = await client().evaluations.datasets.templates.clone('tpl_1');
    expect(cloned.id).toBe('ds_cloned');
  });
});

describe('evaluations.cases', () => {
  it('creates, updates, and deletes a case', async () => {
    const created = await client().evaluations.cases.create('ds_123', { input: { q: 'hi' } });
    expect(created.id).toBe('case_123');
    const updated = await client().evaluations.cases.update('case_123', { notes: 'flagged' });
    expect(updated.notes).toBe('flagged');
    await expect(client().evaluations.cases.delete('case_123')).resolves.toBeUndefined();
  });
});

describe('evaluations.suites', () => {
  it('lists, creates, updates, and deletes a suite', async () => {
    const suites = await client().evaluations.suites.list();
    expect(suites[0].custom_scorer_webhook_secret_set).toBe(false);

    const created = await client().evaluations.suites.create({ name: 'Refund Suite', domain_key: 'support', intent_key: 'refund', dataset_id: 'ds_123' });
    expect(created.id).toBe('suite_123');

    const updated = await client().evaluations.suites.update('suite_123', { name: 'Renamed Suite' });
    expect(updated.name).toBe('Renamed Suite');

    await expect(client().evaluations.suites.delete('suite_123')).resolves.toBeUndefined();
  });

  it('sets a baseline', async () => {
    const suite = await client().evaluations.suites.setBaseline('suite_123', 'run_123');
    expect(suite.baseline_run_id).toBe('run_123');
  });

  it('runs a suite and lists its runs', async () => {
    const run = await client().evaluations.suites.run('suite_123');
    expect(run.status).toBe('pending');
    const runs = await client().evaluations.suites.listRuns('suite_123');
    expect(runs).toHaveLength(1);
  });

  it('compares two models', async () => {
    const { run_a, run_b } = await client().evaluations.suites.compareModels('suite_123', 'gpt-4o-mini', 'gpt-4o');
    expect(run_a.model_override).toBe('gpt-4o-mini');
    expect(run_b.model_override).toBe('gpt-4o');
  });
});

describe('evaluations.reviews', () => {
  it('creates and deletes a review', async () => {
    const review = await client().evaluations.reviews.create('result_1', { verdict: 'agree' });
    expect(review.verdict).toBe('agree');
    await expect(client().evaluations.reviews.delete('rev_1')).resolves.toBeUndefined();
  });
});

describe('evaluations.runs', () => {
  it('lists runs', async () => {
    const runs = await client().evaluations.runs.list();
    expect(runs).toHaveLength(1);
  });

  it('submits an external run', async () => {
    const { run_id } = await client().evaluations.runs.submit({ cases: [{ input: { q: 'a' }, output: 'the answer' }] });
    expect(run_id).toBe('run_ext');
  });

  it('gets run detail and results', async () => {
    const run = await client().evaluations.runs.get('run_123');
    expect(run.status).toBe('completed');
    expect(run.results).toHaveLength(1);
  });

  it('throws a typed 404 for an unknown run', async () => {
    await expect(client().evaluations.runs.get('missing')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('cancels and resumes a run', async () => {
    const cancelled = await client().evaluations.runs.cancel('run_123');
    expect(cancelled.status).toBe('cancelled');
    const resumed = await client().evaluations.runs.resume('run_123');
    expect(resumed.status).toBe('pending');
  });

  it('compares statistically and pairwise', async () => {
    const stat = await client().evaluations.runs.compare('run_123', 'run_456');
    expect(stat.comparison.winner).toBe('run_a');
    const pairwise = await client().evaluations.runs.comparePairwise('run_123', 'run_456');
    expect(pairwise.comparison.cases_compared).toBe(1);
  });
});

describe('evaluations.score', () => {
  it('scores a pair synchronously', async () => {
    const result = await client().evaluations.score({ input: { q: 'hi' }, output: 'hello there' });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(4);
  });
});
