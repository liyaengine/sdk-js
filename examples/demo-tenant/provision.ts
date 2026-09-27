/**
 * Demo tenant provisioning script — "Fernbank Outdoor"
 *
 * Builds the ideal tenant used in live demo sessions: one coherent scenario
 * (a DTC retailer's shipping & returns copilot) that exercises every layer
 * discussed as a competitive differentiator in one script, so a demo doesn't
 * require juggling six separate half-built examples.
 *
 * What this proves, end to end:
 *   1. Domains & Intents         — the base building block
 *   2. Guardrail Policies        — a real PII/hallucination policy, attached
 *   3. Domain agentic tools      — an intent calling a real external endpoint
 *   4. Prompt Studio             — a versioned, published, bound prompt
 *   5. Agents                    — multi-intent orchestration, deployed
 *   6. Workflows                 — a deployed, branching step graph
 *   7. Evaluations + eval gate   — THE differentiator: a suite with a
 *      gate_policy that blocks promotion when quality regresses. This is
 *      the moment to slow down in a demo — nothing else in this space ties
 *      an eval result to a promotion decision this directly.
 *   8. Real-time streaming       — agents.runStream() step events
 *
 * NOT scriptable today, call out live in the demo instead of trying to
 * automate around it:
 *   - Creating the tenant itself (dashboard signup + email verification —
 *     no public /v1 route for this).
 *   - Generating the API key this script needs (Dashboard → Settings →
 *     API Keys — session-auth only, by design).
 *   - BYOK/BYOM model registration (dashboard-only today — see the
 *     "Models" section of the GTM tiers doc for why this is next in line).
 *
 * Prerequisites (one-time, manual):
 *   1. Sign up for a tenant via the dashboard and verify the email.
 *   2. Generate an API key: Dashboard → Settings → API Keys.
 *   3. export LIYA_API_KEY=liya_...
 *      export LIYA_BASE_URL=https://api.liyaengine.ai   # or your staging URL
 *
 * Usage:
 *   npm install                # once, inside examples/demo-tenant
 *   npx tsx provision.ts               # build the demo tenant
 *   npx tsx provision.ts --reset       # delete the demo resources first, then rebuild
 *   npx tsx provision.ts --reset-only  # just delete, don't rebuild
 */

import { LiyaEngine, LiyaEngineAPIError } from '@liyaengine/sdk';

const DOMAIN_KEY = 'shipping-support';
const AGENT_KEY = 'support-copilot';
const PROMPT_KEY = 'return-policy';
const WORKFLOW_NAME = 'Order Escalation';
const POLICY_NAME = 'Strict — Customer Support (Demo)';
const CUSTOM_TOOL_NAME = 'lookup_order';

const apiKey = process.env.LIYA_API_KEY;
if (!apiKey) {
  console.error('Missing LIYA_API_KEY. Generate one in Dashboard → Settings → API Keys, then:\n  export LIYA_API_KEY=liya_...');
  process.exit(1);
}

const liya = new LiyaEngine({
  apiKey,
  baseUrl: process.env.LIYA_BASE_URL ?? 'https://api.liyaengine.ai',
});

function section(title: string): void {
  console.log(`\n\x1b[1m── ${title} ──\x1b[0m`);
}

function ok(label: string, detail?: string): void {
  console.log(`  \x1b[32m✓\x1b[0m ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
}

async function ignoreNotFound(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof LiyaEngineAPIError && (err.status === 404 || err.status === 409)) return;
    throw err;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Reset — best-effort teardown so the script is safe to re-run before a demo.
// ---------------------------------------------------------------------------

async function resetDemoTenant(): Promise<void> {
  section('Resetting prior demo resources (best-effort)');

  await ignoreNotFound(() => liya.agents.delete(AGENT_KEY));
  ok('Agent removed (or did not exist)', AGENT_KEY);

  const workflows = await liya.workflows.list();
  const existingWorkflow = workflows.find(w => w.name === WORKFLOW_NAME);
  if (existingWorkflow) {
    await ignoreNotFound(() => liya.workflows.delete(existingWorkflow.id));
    ok('Workflow removed', WORKFLOW_NAME);
  }

  const policies = await liya.guardrailPolicies.list();
  const existingPolicy = policies.find(p => p.name === POLICY_NAME);
  if (existingPolicy) {
    await ignoreNotFound(() => liya.guardrailPolicies.delete(existingPolicy.id));
    ok('Guardrail policy removed', POLICY_NAME);
  }

  const suites = await liya.evaluations.suites.list({ domain_key: DOMAIN_KEY });
  for (const suite of suites) {
    await ignoreNotFound(() => liya.evaluations.suites.delete(suite.id));
  }
  if (suites.length > 0) ok(`${suites.length} eval suite(s) removed`);

  const datasets = await liya.evaluations.datasets.list();
  const existingDataset = datasets.find(d => d.name === 'Return Policy — Regression Set');
  if (existingDataset) {
    await ignoreNotFound(() => liya.evaluations.datasets.delete(existingDataset.id));
    ok('Eval dataset removed');
  }

  await ignoreNotFound(() => liya.domains.delete(DOMAIN_KEY));
  ok('Domain removed (or did not exist)', DOMAIN_KEY);
}

// ---------------------------------------------------------------------------
// 1-2. Domain, Intents, Guardrail Policy
// ---------------------------------------------------------------------------

async function buildDomainAndGuardrails() {
  section('1. Domain & Intents');
  const domain = await liya.domains.create({
    domain_key: DOMAIN_KEY,
    display_name: 'Shipping & Returns',
    description: 'Fernbank Outdoor’s shipping status and returns copilot.',
    system_prompt: 'You are Fernbank Outdoor’s shipping and returns assistant. Be concise and always cite the specific policy or order detail you used.',
    status: 'active',
  });
  ok('Domain created', domain.domain_key);

  const returnPolicy = await liya.domains.intents.create(DOMAIN_KEY, {
    intent_key: PROMPT_KEY,
    display_name: 'Return Policy',
    description: 'Answers return/refund policy questions from retrieved policy context — never guesses when nothing relevant was retrieved.',
    prompt_template: 'You are Fernbank’s returns assistant. Answer only from the retrieved policy context.',
  });
  ok('Intent created', returnPolicy.intent_key);

  const trackOrder = await liya.domains.intents.create(DOMAIN_KEY, {
    intent_key: 'track-order',
    display_name: 'Track Order',
    description: 'Looks up a real order’s shipping status via the lookup_order tool and reports it plainly.',
    prompt_template: 'Use the lookup_order tool to find the order’s status, then report it in one or two sentences.',
    agent_config: { tools: ['webhook_sender'] }, // the model calls webhook_sender; lookup_order is its argument, not a tool name itself.
  });
  ok('Intent created', trackOrder.intent_key);

  section('2. Guardrail Policy');
  const policy = await liya.guardrailPolicies.create({
    name: POLICY_NAME,
    description: 'Redacts PII in customer messages and blocks unsupported claims about order/policy details.',
    config: {
      pre_llm: { pii: { enabled: true, mode: 'redact' } },
      post_llm: { hallucination_check: { enabled: true } },
    },
  });
  ok('Guardrail policy created', policy.name);
  await liya.guardrailPolicies.attach(policy.id, 'domain', DOMAIN_KEY);
  ok('Attached to domain', DOMAIN_KEY);

  const check = await liya.guardrailPolicies.test({
    policy_id: policy.id,
    stage: 'pre_llm',
    content: 'My order is #A1092, email me at jane@example.com when it ships.',
  });
  ok('Live-tested policy', `passed=${check.passed} (should be false — PII redacted)`);

  return { policy };
}

// ---------------------------------------------------------------------------
// 3. Domain agentic tool
// ---------------------------------------------------------------------------

async function buildDomainTool() {
  section('3. Domain Agentic Tool');
  // webhook_sender is the generic platform tool that actually dispatches
  // every custom tool call; lookup_order is the tool the model names as an
  // argument to it. Both must be present — see the SDK README for the two
  // real footguns this configuration used to hit silently (now
  // server-rejected: WEBHOOK_SENDER_NOT_ENABLED / INVALID_AGENT_TOOL).
  await liya.domains.tools.update(DOMAIN_KEY, {
    enabled_platform_tools: ['webhook_sender'],
    custom_tools: [
      {
        name: CUSTOM_TOOL_NAME,
        display_name: 'Look Up Order',
        description: 'Given an order number, returns its current shipping status, carrier, and ETA.',
        endpoint_url: process.env.DEMO_ORDER_LOOKUP_URL ?? 'https://httpbin.org/post',
        auth_type: 'none',
      },
    ],
  });
  ok('Custom tool defined', CUSTOM_TOOL_NAME);

  const testResult = await liya.domains.tools.test(DOMAIN_KEY, CUSTOM_TOOL_NAME, { order_id: 'A1092' });
  ok('Live-dispatched to real endpoint', `status=${testResult.status_code} latency=${testResult.latency_ms}ms`);
}

// ---------------------------------------------------------------------------
// 4. Prompt Studio — versioned, published, bound to the return-policy intent
// ---------------------------------------------------------------------------

async function buildPromptStudio() {
  section('4. Prompt Studio');
  const prompt = await liya.prompts.create({
    prompt_key: PROMPT_KEY,
    name: 'Return Policy — Fernbank',
    content: 'You are Fernbank’s returns assistant. Answer only from the retrieved policy context — say so if nothing relevant was retrieved, don’t guess.',
  });
  ok('Prompt created (version 1 implicit)', prompt.prompt_key);

  const v1 = prompt.versions[0];
  await liya.prompts.publish(prompt.id, { version_id: v1.id });
  ok('Published to production', `version ${v1.version_number}`);

  await liya.domains.intents.update(DOMAIN_KEY, PROMPT_KEY, {
    prompt_binding: {
      kind: 'library_version',
      prompt_id: prompt.id,
      version_id: v1.id,
      content_hash: v1.content_hash,
    },
  });
  ok('Bound intent to the published version', `${DOMAIN_KEY}/${PROMPT_KEY}`);

  return { prompt, version: v1 };
}

// ---------------------------------------------------------------------------
// 5. Agent
// ---------------------------------------------------------------------------

async function buildAgent(policyId: string) {
  section('5. Agent');
  const agent = await liya.agents.create({
    agent_key: AGENT_KEY,
    name: 'Support Copilot',
    goal: 'Resolve shipping and returns questions end to end — answer policy questions and look up real order status.',
    intent_ids: [`${DOMAIN_KEY}/${PROMPT_KEY}`, `${DOMAIN_KEY}/track-order`],
    knowledge_domain_keys: [DOMAIN_KEY],
  });
  ok('Agent created', agent.agent_key);

  await liya.agents.deploy(AGENT_KEY);
  ok('Deployed');

  await liya.guardrailPolicies.attach(policyId, 'agent', agent.agent_key);
  ok('Guardrail policy attached to agent');

  return agent;
}

// ---------------------------------------------------------------------------
// 6. Workflow
// ---------------------------------------------------------------------------

async function buildWorkflow() {
  section('6. Workflow');
  const workflow = await liya.workflows.create({
    name: WORKFLOW_NAME,
    description: 'When a return-policy question can’t be answered confidently, escalate to a human.',
    steps: [
      { id: 'check', step_type: 'ai_intent', name: 'Answer from policy', config: { domain_key: DOMAIN_KEY, intent_key: PROMPT_KEY }, on_failure_ref: 'escalate' },
      { id: 'escalate', step_type: 'approval', name: 'Escalate to human', config: {} },
    ],
  });
  ok('Workflow created', workflow.name);

  const deployed = await liya.workflows.deploy(workflow.id);
  ok('Deployed', deployed.webhook_url ? `webhook: ${deployed.webhook_url}` : undefined);

  return workflow;
}

// ---------------------------------------------------------------------------
// 7. Evaluations + eval gate — the differentiator
// ---------------------------------------------------------------------------

async function buildEvalGate() {
  section('7. Evaluations — gate-policy demo (THE differentiator)');

  const dataset = await liya.evaluations.datasets.create({
    name: 'Return Policy — Regression Set',
    description: 'Small regression set for the return-policy intent — answers must stay grounded in retrieved context.',
    cases: [
      { input: { message: 'What’s your return window?' }, expected_output: 'Answers with a specific return-window duration, not a vague non-answer.' },
      { input: { message: 'Can I return a used kayak paddle?' }, expected_output: 'Correctly applies the used-gear return policy rather than the general policy.' },
      { input: { message: 'Do you accept returns from Mars?' }, expected_output: 'Declines gracefully — does not fabricate a policy for a nonsensical request.' },
    ],
  });
  ok('Dataset created', `${dataset.case_count} cases`);

  // This is the whole story: a suite with a gate_policy blocks promotion
  // when quality regresses — no assembled Braintrust+Humanloop+Guardrails-AI
  // stack ties an eval result to a promotion decision this directly, because
  // those are three separate vendors with no shared identity graph.
  const suite = await liya.evaluations.suites.create({
    name: 'Return Policy — Release Gate',
    domain_key: DOMAIN_KEY,
    intent_key: PROMPT_KEY,
    dataset_id: dataset.id,
    gate_policy: {
      schema_version: 1,
      require_passed_outcome: true,
      min_pass_rate: 0.8,
    },
  });
  ok('Suite created with a gate_policy', 'min_pass_rate: 0.8, require_passed_outcome: true');

  console.log('  Running the suite against the live intent — this is the moment to narrate in a demo...');
  const run = await liya.evaluations.suites.run(suite.id);

  const started = Date.now();
  let finalRun = await liya.evaluations.runs.get(run.id);
  while (finalRun.status === 'pending' || finalRun.status === 'running') {
    if (Date.now() - started > 120_000) throw new Error('Eval run timed out after 120s — check the dashboard for what got stuck.');
    await sleep(2000);
    finalRun = await liya.evaluations.runs.get(run.id);
    process.stdout.write(`  \x1b[2m...${finalRun.status} (${finalRun.cases_passed}/${dataset.case_count})\x1b[0m\r`);
  }
  console.log('');

  ok('Run completed', `${finalRun.cases_passed}/${finalRun.cases_total} passed, mean score ${finalRun.mean_score}`);

  const gateColor = finalRun.gate_decision === 'passed' ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${gateColor}● GATE DECISION: ${finalRun.gate_decision?.toUpperCase()}\x1b[0m`);
  if (finalRun.gate_failure_reasons && finalRun.gate_failure_reasons.length > 0) {
    for (const reason of finalRun.gate_failure_reasons) console.log(`    \x1b[31m- ${reason}\x1b[0m`);
  }

  return { dataset, suite, run: finalRun };
}

// ---------------------------------------------------------------------------
// 8. Real-time streaming
// ---------------------------------------------------------------------------

async function demoStreaming() {
  section('8. Real-time Agent Streaming');
  console.log('  Streaming a live run — step events arrive as the orchestrator works:');
  for await (const event of liya.agents.runStream(AGENT_KEY, { input: { message: 'What is your return window for unused gear?' } })) {
    if (event.type === 'step') {
      console.log(`  \x1b[36m[step]\x1b[0m ${event.step.type}${event.step.tool_name ? ` — ${event.step.tool_name}` : ''}`);
    } else if (event.type === 'done') {
      ok('Final answer', event.output.slice(0, 120));
    } else if (event.type === 'error') {
      console.error(`  \x1b[31m[error]\x1b[0m ${event.code}: ${event.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--reset') || args.includes('--reset-only')) {
    await resetDemoTenant();
    if (args.includes('--reset-only')) {
      console.log('\nReset complete. Not rebuilding (--reset-only).');
      return;
    }
  }

  console.log('\x1b[1mProvisioning demo tenant: Fernbank Outdoor\x1b[0m');
  const { policy } = await buildDomainAndGuardrails();
  await buildDomainTool();
  await buildPromptStudio();
  await buildAgent(policy.id);
  await buildWorkflow();
  await buildEvalGate();
  await demoStreaming();

  section('Done');
  console.log(`  Domain:   ${DOMAIN_KEY}`);
  console.log(`  Agent:    ${AGENT_KEY}`);
  console.log(`  Prompt:   ${PROMPT_KEY}`);
  console.log('\n  Not automated here — mention live in the demo:');
  console.log('    - BYOK/BYOM model registration is dashboard-only today.');
  console.log('    - The tenant + API key this script used were created via the dashboard signup flow.\n');
}

main().catch(err => {
  if (err instanceof LiyaEngineAPIError) {
    console.error(`\n\x1b[31mAPI error [${err.code}]:\x1b[0m ${err.message}`);
  } else {
    console.error('\n\x1b[31mUnexpected error:\x1b[0m', err);
  }
  process.exit(1);
});
