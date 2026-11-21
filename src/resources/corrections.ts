import type { HttpClient } from '../http.js';

/**
 * Corrections: your application telling LiyaEngine that an answer was wrong and what it should have said. Mirrors `POST /v1/corrections`
 * (see openapi.yaml).
 *
 * For a workspace that serves traffic through the API, with no support inbox or widget handover, this is how a passage of the knowledge base
 * gets flagged: the top two passages the answer was built from are counted against, and three corrections flag a passage for review under
 * Self-healing, Findings, Passages. Call it from your backend when a user marks an answer wrong or edits it. A runtime-scoped key may call it.
 */

export type ReportCorrectionInput = {
  /** What the answer should have said. At most 4000 characters. Personal details are removed. */
  correctAnswer: string;
  /** Why, for example a thumbs-down comment. At most 500 characters. */
  note?: string;
  /** Your own id for the end user who reported it. Optional. Never used to identify anyone to LiyaEngine. */
  endUserId?: string;
} & (
  | {
      /** The `message_id` an intent call returned (`data.message_id`). It must be an assistant answer in this workspace. */
      messageId: string;
      runId?: never;
    }
  | {
      /** The `run_id` an agent run returned (`data.run_id`). The run must have finished. The passages of its last knowledge search are counted against. */
      runId: string;
      messageId?: never;
    }
);

export interface ReportedPassage {
  documentId: string | null;
  fileName: string | null;
  /** Where the trace ranked this passage for the answer, 1 being the best. Null when it was not recorded. */
  rank: number | null;
  /** `passage`: tied to one stored passage. `document_only`: the trace named the document but no single passage could be tied to, so nothing was counted. `lower_ranked`: below the top two passages, so not looked at and not counted. */
  attribution: 'passage' | 'document_only' | 'lower_ranked';
  /** True when this correction was counted against the passage. False for a document-only or lower-ranked passage, or when this conversation had already counted against it. */
  counted: boolean;
  /** True when the passage is flagged for review now. */
  flagged: boolean;
}

export interface CorrectionResult {
  correctionId: string;
  /** True when this answer had already been reported: the correction text was updated and nothing was counted again. */
  alreadyRecorded: boolean;
  passages: ReportedPassage[];
  /** Why nothing was counted, when that is the case. */
  note: string | null;
}

export class CorrectionsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Report that an answer was wrong. Reporting the same answer again updates it and counts nothing a second time, and a conversation counts once
   * against a passage however many of its answers are reported, so retrying is safe. Name the answer by `messageId` (an intent call) or `runId` (an
   * agent run), not both. Throws a 404 `MESSAGE_NOT_FOUND` or `RUN_NOT_FOUND` for an id that is not in this workspace, a 409 `RUN_NOT_FINISHED` for a run
   * still going, and a 400 `INVALID_CORRECTION` for a missing or oversized field.
   */
  async report(input: ReportCorrectionInput): Promise<CorrectionResult> {
    const d = await this.http.post<Record<string, any>>('/v1/corrections', {
      ...(input.messageId !== undefined ? { message_id: input.messageId } : {}),
      ...(input.runId !== undefined ? { run_id: input.runId } : {}),
      correct_answer: input.correctAnswer,
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.endUserId !== undefined ? { end_user_id: input.endUserId } : {}),
    });
    return {
      correctionId: d.correction_id,
      alreadyRecorded: d.already_recorded,
      note: d.note ?? null,
      passages: (d.passages as Array<Record<string, any>>).map((p) => ({ documentId: p.document_id, fileName: p.file_name, rank: p.rank ?? null, attribution: p.attribution, counted: p.counted, flagged: p.flagged })),
    };
  }

  /**
   * Erase what a correction says (question, reply, correct answer, note, end user id). Needs a full-access key. It does NOT lower any passage's
   * count, and an answer whose correction was deleted cannot be reported again (409 `CORRECTION_DELETED`). Deleting twice is safe.
   */
  async delete(correctionId: string): Promise<{ deleted: true; alreadyDeleted: boolean }> {
    const d = await this.http.delete<Record<string, any>>(`/v1/corrections/${encodeURIComponent(correctionId)}`);
    return { deleted: true, alreadyDeleted: !!d.already_deleted };
  }
}
