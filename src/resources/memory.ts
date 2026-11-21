import type { HttpClient } from '../http.js';

/**
 * Learned memory. Today this resource covers outcomes only: `/v1/memory/outcomes` (see openapi.yaml). The rest of `/v1/memory/*` (files,
 * history, approvals, curation) is not wrapped yet.
 */

export type NoteVerdict = 'helps' | 'hurts' | 'neutral' | 'not_enough_data';

export interface NoteOutcome {
  path: string;
  /** Runs that opened this note through the agent's memory tools. */
  runs_with: number;
  /** Percent of those runs that finished, 0 to 100. Null with no runs. */
  success_rate_with: number | null;
  /** Runs of the same agents that did not open it. */
  runs_without: number;
  success_rate_without: number | null;
  /** With minus without, in percentage points. */
  delta_points: number | null;
  verdict: NoteVerdict;
}

/**
 * How agents' runs ended after opening each note. "Finished" means the run's status is `completed`: a reliability signal, not a judgment
 * of the answer. A verdict is an association, not a cause: agents tend to open notes on harder questions.
 */
export interface MemoryOutcomes {
  window_days: number;
  outcome_signal: 'run_finished';
  runs_total: number;
  runs_that_opened_notes: number;
  success_rate_with_notes: number | null;
  success_rate_without_notes: number | null;
  /** True when more runs matched than were read; the numbers then cover the most recent ones. */
  truncated: boolean;
  /** A verdict needs at least this many runs with the note, and this many without. */
  min_runs_with: number;
  min_runs_without: number;
  files: NoteOutcome[];
  /** Files no agent opened in the window, oldest change first. */
  unopened_files: Array<{ path: string; updated_at: string }>;
}

export class MemoryResource {
  constructor(private readonly http: HttpClient) {}

  /** Per-note outcomes over the last 7, 30 (default) or 90 days. Reads only; nothing is changed. */
  outcomes(input: { days?: 7 | 30 | 90 } = {}): Promise<MemoryOutcomes> {
    return this.http.get<MemoryOutcomes>(`/v1/memory/outcomes${input.days !== undefined ? `?days=${input.days}` : ''}`);
  }
}
