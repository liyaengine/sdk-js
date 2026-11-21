import type { HttpClient } from '../http.js';

/**
 * Self-healing settings and the answer checks. Mirrors `/v1/healing/*` (see openapi.yaml). Needs a full-access key: changing the settings can start
 * spending money, so a runtime-scoped key cannot.
 */

export interface HealingSettings {
  /** `off` (default) or `stage`: a nightly job puts an open roll-back in as a DRAFT. It never deploys. */
  rollbackMode: 'off' | 'stage';
  /** `off` (default) or `stage`: the same for a raised step or tool-call limit. */
  limitMode: 'off' | 'stage';
  /** Off by default. Each check is a metered model call billed to the workspace. */
  answerChecksEnabled: boolean;
  /** Share of answers checked, 1 to 25. */
  answerCheckSamplePct: number;
  /** The nightly job stops checking for the UTC day once this much has been spent. 0.5 to 500. */
  answerCheckDailyCapUsd: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UpdateHealingSettingsInput {
  rollbackMode?: 'off' | 'stage';
  limitMode?: 'off' | 'stage';
  answerChecksEnabled?: boolean;
  answerCheckSamplePct?: number;
  answerCheckDailyCapUsd?: number;
}

export interface AnswerCheckSummary {
  windowDays: number;
  checked: number;
  supported: number;
  partlySupported: number;
  unsupported: number;
  /** Share of checked answers not supported at all. A sample, so a rough rate. Null when nothing was checked. */
  unsupportedRate: number | null;
  spentUsd: number;
  /** The latest answers that were not fully supported. `messageId` opens the trace. */
  examples: Array<{ messageId: string; verdict: 'supported' | 'partly_supported' | 'unsupported'; reason: string | null; checkedAt: string }>;
}

const mapSettings = (s: Record<string, any>): HealingSettings => ({
  rollbackMode: s.rollback_mode, limitMode: s.limit_mode, answerChecksEnabled: s.answer_checks_enabled, answerCheckSamplePct: s.answer_check_sample_pct,
  answerCheckDailyCapUsd: s.answer_check_daily_cap_usd, updatedAt: s.updated_at ?? null, updatedBy: s.updated_by ?? null,
});

export class HealingResource {
  constructor(private readonly http: HttpClient) {}

  /** What self-healing may do on its own. A workspace that never saved any has every default: nothing automatic and no answer checks. */
  async settings(): Promise<HealingSettings> {
    const d = await this.http.get<{ settings: Record<string, any> }>('/v1/healing/settings');
    return mapSettings(d.settings);
  }

  /** Change only the fields given. Takes effect at the next nightly run. Throws a 400 `INVALID_SETTINGS` for a value out of range. */
  async updateSettings(input: UpdateHealingSettingsInput): Promise<HealingSettings> {
    const body: Record<string, unknown> = {};
    if (input.rollbackMode !== undefined) body.rollback_mode = input.rollbackMode;
    if (input.limitMode !== undefined) body.limit_mode = input.limitMode;
    if (input.answerChecksEnabled !== undefined) body.answer_checks_enabled = input.answerChecksEnabled;
    if (input.answerCheckSamplePct !== undefined) body.answer_check_sample_pct = input.answerCheckSamplePct;
    if (input.answerCheckDailyCapUsd !== undefined) body.answer_check_daily_cap_usd = input.answerCheckDailyCapUsd;
    const d = await this.http.put<{ settings: Record<string, any> }>('/v1/healing/settings', body);
    return mapSettings(d.settings);
  }

  /** What the sampled answer checks found, and what they cost. A verdict is a model's reading: a reason to look, not proof. `days` is 7 to 90 (default 30). */
  async answerChecks(input: { days?: number } = {}): Promise<AnswerCheckSummary> {
    const d = await this.http.get<Record<string, any>>(`/v1/healing/answer-checks${input.days === undefined ? '' : `?days=${encodeURIComponent(String(input.days))}`}`);
    return {
      windowDays: d.window_days, checked: d.checked, supported: d.supported, partlySupported: d.partly_supported, unsupported: d.unsupported, unsupportedRate: d.unsupported_rate, spentUsd: d.spent_usd,
      examples: (d.examples as Array<Record<string, any>>).map((e) => ({ messageId: e.message_id, verdict: e.verdict, reason: e.reason, checkedAt: e.checked_at })),
    };
  }
}
